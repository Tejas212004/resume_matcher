from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
import tempfile
import os
import fitz  # PyMuPDF
import docx2txt
import random
import re
from sentence_transformers import SentenceTransformer, util

router = APIRouter(prefix="/interview", tags=["Mock Interview"])

# Load the model once
model = SentenceTransformer("all-MiniLM-L6-v2")

# --------------------------------------
# 🧩 Utility functions
# --------------------------------------
def extract_text(file: UploadFile) -> str:
    """Extract text from PDF, DOCX, or TXT files."""
    suffix = os.path.splitext(file.filename)[1].lower()
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(file.file.read())
        tmp_path = tmp.name

    text = ""
    try:
        if suffix == ".pdf":
            with fitz.open(tmp_path) as doc:
                for page in doc:
                    text += page.get_text("text")
        elif suffix == ".docx":
            text = docx2txt.process(tmp_path)
        elif suffix == ".txt":
            with open(tmp_path, "r", encoding="utf-8", errors="ignore") as f:
                text = f.read()
        else:
            raise ValueError("Unsupported file format.")
    finally:
        os.remove(tmp_path)

    return text.strip()


def extract_skills(text: str):
    """Detect key skills."""
    skills = [
        "python", "java", "javascript", "react", "node", "django", "flask", "fastapi",
        "aws", "azure", "docker", "sql", "html", "css",
        "machine learning", "nlp", "pandas", "numpy",
        "leadership", "communication", "teamwork", "problem solving"
    ]
    text = text.lower()
    return [s for s in skills if re.search(rf"\b{s}\b", text)]

# --------------------------------------
# 🎯 Generate Interview Questions
# --------------------------------------
@router.post("/generate")
async def generate_interview_questions(
    resume: UploadFile = File(...),
    jd: UploadFile | None = File(None),
    jd_text: str | None = Form(None),
):
    """Generate tailored interview questions based on resume or job description."""
    resume_text = extract_text(resume)
    resume_skills = extract_skills(resume_text)

    jd_skills = []
    if jd:
        jd_text_final = extract_text(jd)
        jd_skills = extract_skills(jd_text_final)
    elif jd_text:
        jd_skills = extract_skills(jd_text)

    combined_skills = list(set(resume_skills + jd_skills))
    if not combined_skills:
        combined_skills = ["communication", "problem solving", "teamwork"]

    base_questions = [
        "Can you describe your experience working with {}?",
        "What challenges have you faced when using {}?",
        "How do you stay updated with the latest trends in {}?",
        "Can you explain a project where you used {}?",
        "What are some best practices you follow when working with {}?",
    ]

    general_questions = [
        "Tell me about yourself.",
        "Why do you want to work with our company?",
        "What is your biggest strength?",
        "Describe a time you handled a difficult situation.",
        "Where do you see yourself in 5 years?",
    ]

    skill_questions = [
        random.choice(base_questions).format(skill)
        for skill in random.sample(combined_skills, min(5, len(combined_skills)))
    ]

    return {
        "total_questions": len(general_questions) + len(skill_questions),
        "questions": general_questions + skill_questions,
    }

# --------------------------------------
# 🧠 Evaluate Interview Answers
# --------------------------------------
class EvaluationRequest(BaseModel):
    questions: list[str]
    answers: list[str]

@router.post("/evaluate")
async def evaluate_answers(data: EvaluationRequest):
    """Evaluate answers semantically using SentenceTransformer."""
    try:
        if not data.questions or not data.answers or len(data.questions) != len(data.answers):
            raise HTTPException(status_code=400, detail="Questions and answers mismatch.")

        scores = []
        for q, a in zip(data.questions, data.answers):
            q_emb = model.encode(q, convert_to_tensor=True)
            a_emb = model.encode(a, convert_to_tensor=True)
            sim = float(util.cos_sim(q_emb, a_emb))
            scores.append(round(sim * 100, 2))

        avg_score = round(sum(scores) / len(scores), 2)
        feedback = [
            "Excellent answer!" if s > 80 else
            "Good, but can be improved." if s > 60 else
            "Needs more detail and structure."
            for s in scores
        ]

        return {
            "average_score": avg_score,
            "individual_scores": scores,
            "feedback": feedback
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
