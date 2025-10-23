from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import fitz  # PyMuPDF
import docx2txt
import tempfile
import os
import re

app = FastAPI(title="Skill-Based Resume Matcher")

# Allow frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------ Utility Functions ------------------

def extract_text(file: UploadFile):
    """Extract text from PDF, DOCX or TXT."""
    suffix = os.path.splitext(file.filename)[1].lower()
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(file.file.read())
        tmp_path = tmp.name

    text = ""
    if suffix == ".pdf":
        with fitz.open(tmp_path) as doc:
            for page in doc:
                text += page.get_text("text")
    elif suffix == ".docx":
        text = docx2txt.process(tmp_path)
    elif suffix == ".txt":
        with open(tmp_path, "r", encoding="utf-8", errors="ignore") as f:
            text = f.read()

    os.remove(tmp_path)
    return text.strip()


def extract_skills(text: str):
    """Extract skills from text using a predefined skill list."""
    skills = [
        # --- core technical ---
        "python", "java", "javascript", "c++", "sql", "html", "css",
        "react", "node", "django", "flask", "fastapi", "git", "docker",
        "aws", "azure", "gcp", "tensorflow", "pytorch", "machine learning",
        "deep learning", "nlp", "data analysis", "pandas", "numpy",
        # --- soft / misc ---
        "communication", "leadership", "teamwork", "problem solving",
        "project management", "creativity"
    ]

    text = text.lower()
    found = []
    for skill in skills:
        if re.search(r"\b" + re.escape(skill) + r"\b", text):
            found.append(skill)
    return list(set(found))


def calculate_skill_match(resume_skills, jd_skills):
    """Compute percentage of JD skills found in resume."""
    if not jd_skills:
        return 0
    matched = len(set(resume_skills) & set(jd_skills))
    return round((matched / len(jd_skills)) * 100, 2)


# ------------------ Routes ------------------

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/match")
async def match_files(
    resume: UploadFile = File(...),
    jd: UploadFile | None = File(None),
    jd_text: str | None = Form(None),
):
    """Compare only skills between resume and job description."""

    resume_text = extract_text(resume)

    if jd:
        jd_text_final = extract_text(jd)
    elif jd_text:
        jd_text_final = jd_text.strip()
    else:
        return {"error": "Please upload or paste a job description."}

    resume_skills = extract_skills(resume_text)
    jd_skills = extract_skills(jd_text_final)

    score = calculate_skill_match(resume_skills, jd_skills)

    return {
        "match_score": score,
        "resume_skills": resume_skills,
        "jd_skills": jd_skills,
        "matched_skills": list(set(resume_skills) & set(jd_skills)),
    }
