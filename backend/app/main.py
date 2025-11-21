# backend/app/main.py

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import fitz # PyMuPDF
import docx2txt
import tempfile
import os
import re
import logging
import json 
from sentence_transformers import SentenceTransformer, util
import asyncio # For clean async file handling

# Import the processor which contains the ML logic and model loading
from app import resume_processor 

# ----------------- Logging -----------------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("resume_matcher")

# ----------------- Global Caching -----------------
# Simple in-memory cache to store resume content by a unique file name
file_cache = {} 

# ----------------- Pydantic Models -----------------
# Define the data structure for the Text Evaluation request
class InterviewTextRequest(BaseModel):
    question: str
    answer: str 
    resume_content: str 
    current_question_index: int = 0 

# 🛑 NEW: Model for Bulk Evaluation
class BulkEvaluationRequest(BaseModel):
    resume_content: str
    # List of dictionaries: [{"question": "...", "answer": "..."}, ...]
    qa_pairs: list[dict] 

# ----------------- App init -----------------
app = FastAPI(title="AI-Powered Resume & Interview Assistant")

# ----------------- CORS -----------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------- Load model once -----------------
model = None
try:
    logger.info("🔹 Loading SentenceTransformer model...")
    model = SentenceTransformer("all-MiniLM-L6-v2")
    logger.info("✅ SentenceTransformer model loaded!")
except Exception as e:
    logger.error(f"CRITICAL: Error loading SentenceTransformer: {e}")

# Load ML models from the processor on startup
resume_processor.load_models()
logger.info("✅ Core ML models for ATS/Interview loaded!")


# ----------------- Utility functions -----------------
async def extract_text(file: UploadFile) -> str:
    """Extract text from PDF, DOCX, or TXT files."""
    file_content = await file.read()
    
    if not file_content:
        return ""
        
    suffix = os.path.splitext(file.filename)[1].lower()
    
    # Use asyncio to run the blocking file operations in a thread pool
    text = await asyncio.to_thread(_perform_text_extraction_blocking, file_content, suffix)

    return text.strip()

def _perform_text_extraction_blocking(file_content: bytes, suffix: str) -> str:
    """Blocking part of text extraction running in a separate thread."""
    text = ""
    tmp_path = None
    
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(file_content)
            tmp_path = tmp.name

        if suffix == ".pdf":
            with fitz.open(tmp_path) as doc:
                text = "".join(page.get_text() for page in doc)
        elif suffix == ".docx":
            text = docx2txt.process(tmp_path)
        elif suffix == ".txt":
            with open(tmp_path, "r", encoding="utf-8", errors="ignore") as f:
                text = f.read()
        else:
            logger.error(f"Unsupported file format: {suffix}")
            return ""

    except Exception as e:
        logger.error(f"Error during text extraction of {suffix}: {e}")
        return "" 
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)
            
    return text.strip()


def semantic_skill_match(resume_skills: list[str], jd_skills: list[str], threshold: float = 0.6):
    """Find semantically similar skills between resume and JD using embeddings."""
    if not model or not resume_skills or not jd_skills:
        return [], 0.0

    resume_embeddings = model.encode(resume_skills, convert_to_tensor=True)
    jd_embeddings = model.encode(jd_skills, convert_to_tensor=True)
    cosine_scores = util.cos_sim(resume_embeddings, jd_embeddings)

    matched = set()
    for i in range(len(resume_skills)):
        for j in range(len(jd_skills)):
            if float(cosine_scores[i][j]) >= threshold:
                matched.add(jd_skills[j])

    score = round((len(matched) / len(jd_skills)) * 100, 2) if jd_skills else 0.0
    return list(matched), score


# ----------------- Routes -----------------

@app.get("/health")
def health():
    return {"status": "ok"}

# --- 1. ATS/ML Analysis Route (UPDATED FOR JD) ---
@app.post("/analyze_resume")
async def analyze_resume(
    resume: UploadFile = File(...),
    jd: UploadFile | None = File(None),      
    jd_text: str | None = Form(None)         
):
    """
    Performs comprehensive ATS/ML analysis and generates interview questions.
    Now supports JD context for smarter question generation.
    """
    try:
        # 1. Extract Text from Resume
        resume_content = await extract_text(resume)
        
        if not resume_content:
            raise HTTPException(status_code=400, detail="Could not extract text from the file.")
            
        # 2. Extract Text from JD (if provided)
        jd_content = ""
        if jd:
            jd_content = await extract_text(jd)
        elif jd_text:
            jd_content = jd_text.strip()

        # 3. Cache the resume content for interview evaluation steps
        file_cache[resume.filename] = resume_content 

        # 4. Run the Analysis (Passing BOTH Resume and JD now)
        analysis_result = resume_processor.perform_ats_analysis(resume_content, jd_content)
        
        # Add the filename to the response so the frontend knows the key for the cache
        analysis_result['resume_name'] = resume.filename

        return JSONResponse(content=analysis_result)

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error in /analyze_resume for {resume.filename}")
        return JSONResponse(
            status_code=500,
            content=resume_processor._get_empty_analysis_result(f"Analysis error: {str(e)}", resume_content)
        )


# --- 2. JD Match Route ---
@app.post("/match")
async def match_files(
    resume: UploadFile = File(...),
    jd: UploadFile | None = File(None),
    jd_text: str | None = Form(None),
):
    """
    Compare resume and job description for skill match using semantic similarity.
    """
    try:
        resume_text = await extract_text(resume)

        if jd:
            jd_text_final = await extract_text(jd)
        elif jd_text:
            jd_text_final = jd_text.strip()
        else:
            return {
                "match_score": 0.0,
                "resume_skills": resume_processor.extract_skills_from_text(resume_text),
                "jd_skills": [],
                "matched_skills": [],
            }

        if not jd_text_final:
            raise HTTPException(status_code=400, detail="Could not extract text from JD file or JD text is empty.")
            
        resume_skills = resume_processor.extract_skills_from_text(resume_text)
        jd_skills = resume_processor.extract_skills_from_text(jd_text_final)

        matched_skills, match_score = semantic_skill_match(resume_skills, jd_skills)

        return {
            "match_score": match_score,
            "resume_skills": resume_skills,
            "jd_skills": jd_skills,
            "matched_skills": matched_skills,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error in /match")
        raise HTTPException(status_code=500, detail=str(e))

# --- 3. Mock Interview Evaluation Route (Audio Integrated) ---
@app.post("/interview/evaluate_audio")
async def evaluate_interview_audio(
    resume_name: str = Form(...),
    current_question: str = Form(...),
    audio_file: UploadFile = File(...),
):
    """
    Accepts audio recording, transcribes it using Whisper, and evaluates the answer.
    """
    
    # Retrieve Resume Context
    resume_content = file_cache.get(resume_name)
    if not resume_content:
        logger.error(f"Resume context not found for key: {resume_name}")
        raise HTTPException(
            status_code=400, 
            detail="Resume context is missing. Please run the initial ATS analysis first."
        )

    # Save Audio and Transcribe
    transcribed_text = ""
    audio_path = ""
    try:
        import whisper 

        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp_file:
            audio_data = await audio_file.read()
            tmp_file.write(audio_data)
            audio_path = tmp_file.name
        
        def transcribe_blocking(path):
            model_whisper = whisper.load_model("base")
            return model_whisper.transcribe(path)["text"].strip()
            
        transcribed_text = await asyncio.to_thread(transcribe_blocking, audio_path)
        logger.info(f"Transcribed Text: {transcribed_text[:50]}...")
        
    except ImportError:
        raise HTTPException(status_code=500, detail="Audio transcription not configured. Install 'openai-whisper'.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Audio processing error: {e}")
    finally:
        if os.path.exists(audio_path):
            os.remove(audio_path)
            
    # Evaluate
    feedback_result = resume_processor.evaluate_interview_answers(
        questions=[current_question],
        answers=[transcribed_text],
        resume_content=resume_content,
        transcribed_text=transcribed_text
    )
    
    response = {
        "score": feedback_result["individual_scores"][0] if feedback_result["individual_scores"] else 0,
        "feedback": feedback_result["individual_feedback"][0] if feedback_result["individual_feedback"] else "Evaluation error.",
        "transcribed_text": transcribed_text,
    }

    return JSONResponse(content=response)


# --- 4. Mock Interview Evaluation Route (Text Integrated) ---
@app.post("/interview/evaluate_text")
async def evaluate_interview_text(request: InterviewTextRequest):
    """
    Evaluates a single question/answer pair submitted as text.
    """
    logger.info(f"Received text evaluation request for question: {request.question[:30]}...")
    try:
        if not request.resume_content:
            raise HTTPException(status_code=400, detail="Resume content is required.")
              
        evaluation_result = resume_processor.evaluate_interview_answers(
            questions=[request.question],
            answers=[request.answer],
            resume_content=request.resume_content,
            transcribed_text=request.answer
        )
        
        return {
            "score": evaluation_result.get("individual_scores", [0])[0],
            "feedback": evaluation_result.get("individual_feedback", ["Evaluation error."])[0],
            "transcribed_text": evaluation_result.get("transcribed_text", request.answer),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error evaluating interview text.")
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {str(e)}")

# --- 5. 🛑 NEW: BULK EVALUATION ENDPOINT (For Exam Mode) ---
@app.post("/interview/evaluate_bulk")
async def evaluate_bulk_interview(request: BulkEvaluationRequest):
    """
    Evaluates ALL questions at once after the user finishes the interview.
    """
    logger.info(f"Received bulk evaluation request for {len(request.qa_pairs)} questions.")
    
    try:
        if not request.resume_content:
            raise HTTPException(status_code=400, detail="Resume content is required.")
            
        # Unpack the list of dicts into two lists
        questions = [item['question'] for item in request.qa_pairs]
        answers = [item['answer'] for item in request.qa_pairs]
        
        # Reuse the existing processor logic (it already handles lists!)
        evaluation_result = resume_processor.evaluate_interview_answers(
            questions=questions,
            answers=answers,
            resume_content=request.resume_content
        )
        
        # Calculate overall score
        scores = evaluation_result.get("individual_scores", [])
        avg_score = sum(scores) / len(scores) if scores else 0
        
        return {
            "overall_score": round(avg_score, 1),
            "individual_scores": scores,
            "individual_feedback": evaluation_result.get("individual_feedback", []),
            "feedback_summary": "Great job completing the interview! Review your individual feedback below."
        }

    except Exception as e:
        logger.exception("Error in bulk evaluation.")
        raise HTTPException(status_code=500, detail=f"Bulk evaluation failed: {str(e)}")