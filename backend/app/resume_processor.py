# backend/app/resume_processor.py

import joblib
import re
import pandas as pd
import logging
import random
import os
from sentence_transformers import SentenceTransformer, util 

# Set the path where your models and data files are located
MODELS_PATH = "app/models/"
DATA_PATH = "app/models/"

logger = logging.getLogger("resume_processor")
logger.setLevel(logging.INFO)

# --- 1. THE MASSIVE SKILL DATABASE ---
ALL_SKILLS = [
    'Python', 'Data Analysis', 'Machine Learning', 'Communication', 'Project Management', 'Deep Learning', 'SQL',
    'Tableau', 'Java', 'C++', 'JavaScript', 'HTML', 'CSS', 'React', 'Angular', 'Node.js', 'MongoDB', 'Express.js', 
    'Git', 'Research', 'Statistics', 'Quantitative Analysis', 'Qualitative Analysis', 'SPSS', 'R', 
    'Data Visualization', 'Matplotlib', 'Seaborn', 'Plotly', 'Pandas', 'Numpy', 'Scikit-learn', 'TensorFlow', 
    'Keras', 'PyTorch', 'NLTK', 'Text Mining', 'Natural Language Processing', 'Computer Vision', 'Image Processing', 
    'OCR', 'Speech Recognition', 'Recommendation Systems', 'Reinforcement Learning', 'Neural Networks', 
    'XGBoost', 'Random Forest', 'Decision Trees', 'Support Vector Machines', 'Linear Regression', 'Logistic Regression', 
    'K-Means Clustering', 'Apache Spark', 'Docker', 'Kubernetes', 'Linux', 'Shell Scripting', 'Cybersecurity', 
    'CI/CD', 'DevOps', 'Agile Methodology', 'Scrum', 'Software Development', 'Web Development', 'Mobile Development', 
    'Backend Development', 'Frontend Development', 'Full-Stack Development', 'UI/UX Design', 'Figma', 'Adobe XD',
    'Product Management', 'Sales', 'Marketing', 'SEO', 'Google Analytics', 'AWS', 'Azure', 'GCP', 'FastAPI', 'Flask',
    'Django', 'Spring Boot', 'Hibernate', 'Microservices', 'REST API', 'GraphQL', 'Redux', 'TypeScript', 'Next.js'
]

# Global variables
category_model = None
job_model = None
category_vectorizer = None
job_vectorizer = None
semantic_model = None 
job_descriptions_df = None
skills_data = None

# --- 2. MOCK CLASSES ---
class MockVectorizer:
    def transform(self, data): return data[0] 

class MockClassifier:
    def __init__(self, mode): self.mode = mode 
    def predict(self, text):
        text_lower = str(text).lower()
        if self.mode == 'category':
            if "java" in text_lower or "react" in text_lower: return ["Software Engineering"]
            if "sql" in text_lower or "data" in text_lower: return ["Data Science"]
            return ["Data Science"] 
        else:
            if "react" in text_lower: return ["Frontend Developer"]
            if "python" in text_lower: return ["Data Scientist"]
            return ["Software Engineer"] 

# --- 3. HELPER FUNCTIONS ---
def clean_text(text):
    if not text: return ""
    text = str(text).lower()
    text = re.sub(r'http\S+\s', ' ', text)
    text = re.sub(r'[^a-z0-9\s]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def extract_contact_info(text):
    # 1. Improved Name Extraction: Handles Title Case (John Doe) AND All Caps (JOHN DOE)
    # It looks for the first line that has 2-4 words, is not a common label, and has letters.
    lines = text.split('\n')
    name = "Candidate Name"
    
    for line in lines[:10]: # Check first 10 lines only
        clean_line = line.strip()
        # Skip empty lines or lines with common labels
        if not clean_line or any(x in clean_line.lower() for x in ['resume', 'curriculum', 'vitae', 'cv', 'bio', 'phone', 'email', 'contact']):
            continue
        
        # Check if line is 2-4 words long and mostly letters
        words = clean_line.split()
        if 2 <= len(words) <= 4 and all(len(w) > 1 for w in words) and not any(char.isdigit() for char in clean_line):
            name = clean_line
            break

    # 2. Email Extraction
    email_match = re.search(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b", text)
    email = email_match.group(0) if email_match else "N/A"
    
    # 3. Phone Extraction
    phone_match = re.search(r"(\(?\d{3}\)?)?\s*[-.\s]?\d{3}\s*[-.\s]?\d{4}(?!\d)", text)
    phone = phone_match.group(0).strip() if phone_match else "N/A"
    
    return name, email, phone

# 🛑 FIX: Robust Line-by-Line Education Extraction
def extract_education(text):
    """
    Extracts education details by scanning every line for degree/institute keywords.
    This is more robust than regex blocks for messy PDF text.
    """
    extracted = []
    
    # 1. Keywords that strongly indicate an education line
    degree_keywords = [
        r"\bb\.?tech\b", r"\bm\.?tech\b", r"\bb\.?e\b", r"\bb\.?s\b", r"\bm\.?s\b", 
        r"\bbachelor", r"\bmaster", r"\bdiploma\b", r"\bph\.?d\b", r"\bdegree\b",
        r"\bhigher\s?secondary\b", r"\bsenior\s?secondary\b", r"\bxii\b", r"\bx\b"
    ]
    institute_keywords = [
        r"\buniversity\b", r"\binstitute\b", r"\bcollege\b", r"\bschool\b", r"\bacademy\b"
    ]
    
    # Split text into lines to handle formatting
    lines = text.split('\n')
    
    for line in lines:
        clean_line = line.strip()
        if len(clean_line) < 5: continue # Skip very short lines
        
        # Check for degree match
        has_degree = any(re.search(pat, clean_line, re.IGNORECASE) for pat in degree_keywords)
        
        # Check for institute match
        has_institute = any(re.search(pat, clean_line, re.IGNORECASE) for pat in institute_keywords)
        
        # Heuristic: Keep the line if it mentions a Degree OR an Institute
        if has_degree or has_institute:
            extracted.append(clean_line)
            
    # Return unique top results
    return list(set(extracted))[:5]

def extract_skills_from_text(text):
    text_lower = clean_text(text)
    found = []
    for skill in ALL_SKILLS:
        pattern = r"\b{}\b".format(re.escape(skill.lower()))
        if re.search(pattern, text_lower):
            found.append(skill)
    return list(set(found))

# --- 4. MODEL LOADING ---
def load_models():
    global category_model, job_model, category_vectorizer, job_vectorizer, semantic_model
    try:
        category_model = joblib.load(MODELS_PATH + "rf_classifier_categorization.pkl")
        category_vectorizer = joblib.load(MODELS_PATH + "tfidf_vectorizer_categorization.pkl")
        job_model = joblib.load(MODELS_PATH + "rf_classifier_job_recommendation.pkl")
        job_vectorizer = joblib.load(MODELS_PATH + "tfidf_vectorizer_job_recommendation.pkl")
        logger.info("✅ ML Models loaded successfully.")
    except Exception as e:
        logger.warning(f"⚠️ ML Models missing ({e}). Using MOCK logic.")
        category_vectorizer = MockVectorizer()
        job_vectorizer = MockVectorizer()
        category_model = MockClassifier('category')
        job_model = MockClassifier('job')
    
    try:
        logger.info("🔹 Loading SentenceTransformer for Realistic Scoring...")
        semantic_model = SentenceTransformer('all-MiniLM-L6-v2')
        logger.info("✅ AI Scoring Model loaded.")
    except Exception as e:
        logger.error(f"CRITICAL: Could not load AI Scoring Model: {e}")
        semantic_model = None

    return True

# --- 5. PREDICTION & LOGIC ---
def predict_category(text):
    if not category_model: return "Unknown"
    cleaned = clean_text(text)
    features = category_vectorizer.transform([cleaned])
    prediction = category_model.predict(features)
    return prediction[0]

def generate_recommendation(text):
    if not job_model: return "Unknown"
    cleaned = clean_text(text)
    features = job_vectorizer.transform([cleaned])
    prediction = job_model.predict(features)
    return prediction[0]

def calculate_ats_score(text, recommended_job, extracted_skills):
    score = 0
    word_count = len(text.split())
    if 300 <= word_count <= 1000: score += 25
    else: score += 10
    if len(extracted_skills) >= 5: score += 25
    if len(extracted_skills) >= 10: score += 15
    name, email, phone = extract_contact_info(text)
    if email != "N/A": score += 15
    if phone != "N/A": score += 10
    if any(x in text.lower() for x in ['experience', 'education', 'projects']): score += 10
    return min(100, score)

def generate_personalized_tips(text, recommended_job, extracted_skills):
    tips = []
    if len(extracted_skills) < 5: tips.append("Low keyword density. Add more technical skills.")
    if not re.search(r'\d+%', text): tips.append("Quantify your achievements with numbers (e.g., 'Improved by 20%').")
    if recommended_job != "Unknown": tips.append(f"Highlight projects relevant to {recommended_job}.")
    if not tips: tips.append("Resume looks good! Focus on tailoring it to specific JDs.")
    return tips

# --- 6. GAP ANALYSIS ---
def analyze_skill_gap_and_future(recommended_job, extracted_skills):
    required_skills_map = {
        "Data Scientist": ["Python", "SQL", "Machine Learning", "Pandas", "Tableau"],
        "Backend Developer": ["Java", "Spring", "SQL", "Microservices", "Docker"],
        "Frontend Developer": ["React", "JavaScript", "CSS", "HTML", "Redux"],
        "DevOps Engineer": ["AWS", "Docker", "Kubernetes", "Linux", "CI/CD"],
        "Software Engineering": ["Git", "System Design", "Algorithms", "Testing"]
    }
    future_trends_map = {
        "Data Scientist": ["MLOps", "Explainable AI", "Big Data (Spark)"],
        "Backend Developer": ["Serverless Architecture", "GraphQL", "Go Language"],
        "Frontend Developer": ["WebAssembly", "Next.js", "Accessibility"],
        "DevOps Engineer": ["GitOps", "Service Mesh", "DevSecOps"]
    }
    target_skills = required_skills_map.get(recommended_job, ["Communication", "Problem Solving"])
    missing = [s for s in target_skills if s not in extracted_skills]
    future = future_trends_map.get(recommended_job, ["Cloud Computing", "AI Tools"])
    return missing[:5], future

def generate_radar_data(extracted_skills, recommended_job):
    areas = ["Coding", "Communication", "Problem Solving", "Tools", "Teamwork"]
    data = []
    for area in areas:
        base = 50
        if area == "Coding" and len(extracted_skills) > 5: base += 30
        if area == "Tools" and len(extracted_skills) > 8: base += 30
        score = min(100, base + random.randint(0, 20))
        data.append({"skill": area, "score": score})
    return data

# --- 7. INTERNAL ERROR HANDLER ---
def _get_empty_analysis_result(error_message, resume_text=""):
    return {
        "ats_score": 0, "predicted_category": "Error", "recommended_job": "Error",
        "name": "N/A", "email": "N/A", "phone": "N/A", "extracted_skills": [],
        "extracted_education": [], "personalized_tips": [error_message],
        "missing_skills": [], "future_skills": [], "interview_questions": [],
        "radar_data": [], "resume_content_text": resume_text
    }

# --- 8. MAIN ORCHESTRATOR ---
def perform_ats_analysis(resume_text, jd_text=""):
    if not resume_text or len(resume_text) < 50:
        return _get_empty_analysis_result("Resume text too short.", resume_text)
    try:
        name, email, phone = extract_contact_info(resume_text)
        extracted_skills = extract_skills_from_text(resume_text)
        extracted_education = extract_education(resume_text)
        predicted_category = predict_category(resume_text)
        recommended_job = generate_recommendation(resume_text)
        ats_score = calculate_ats_score(resume_text, recommended_job, extracted_skills)
        tips = generate_personalized_tips(resume_text, recommended_job, extracted_skills)
        missing, future = analyze_skill_gap_and_future(recommended_job, extracted_skills)
        radar_data = generate_radar_data(extracted_skills, recommended_job)
        
        # RANDOMIZED QUESTION GENERATION LOGIC
        interview_questions = []
        
        # 1. Determine Skill Source
        target_skills = []
        if jd_text and len(jd_text) > 10:
            jd_skills = extract_skills_from_text(jd_text)
            if jd_skills:
                target_skills = list(set(jd_skills)) 
        
        if not target_skills:
            target_skills = list(set(extracted_skills))

        # 2. Shuffle for Randomness
        if target_skills:
            random.shuffle(target_skills) 
        
        # 3. Generate Mix of Questions
        if target_skills:
            interview_questions.append(f"Can you walk me through a complex project where you utilized {target_skills[0]}?")
        else:
            interview_questions.append("Tell me about the most challenging technical project you have worked on.")

        if len(target_skills) > 1:
            interview_questions.append(f"How would you rate your proficiency in {target_skills[1]}, and can you give an example of its application?")
        else:
            interview_questions.append(f"What attracts you to the {recommended_job} role specifically?")

        behavioral_bank = [
            "Describe a time you had to debug a critical issue under pressure.",
            "Tell me about a time you disagreed with a team member's technical approach.",
            "Describe a situation where you had to learn a new tool in a short period of time.",
            "Have you ever failed to meet a deadline? How did you handle it?"
        ]
        interview_questions.append(random.choice(behavioral_bank))

        interview_questions.append(f"How do you approach ensuring scalability and maintainability in {predicted_category} projects?")

        soft_bank = [
            "Where do you see your technical skills growing in the next 2 years?",
            "How do you handle feedback on your code or designs?",
            f"Why do you believe you are a good fit for this {recommended_job} position?",
            "What is your preferred work style: independent contributor or team collaborator?"
        ]
        interview_questions.append(random.choice(soft_bank))
        
        return {
            "ats_score": ats_score, "predicted_category": predicted_category,
            "recommended_job": recommended_job, "name": name, "email": email, "phone": phone,
            "extracted_skills": extracted_skills, "extracted_education": extracted_education,
            "personalized_tips": tips, "missing_skills": missing, "future_skills": future,
            "interview_questions": interview_questions, "radar_data": radar_data,
            "resume_content_text": resume_text
        }
    except Exception as e:
        logger.error(f"Analysis Error: {e}")
        return _get_empty_analysis_result(str(e), resume_text)

# --- 9. AI INTERVIEW EVALUATION ---
def evaluate_interview_answers(questions, answers, resume_content, transcribed_text=None):
    individual_scores = []
    individual_feedback = []
    
    if not isinstance(questions, list): questions = [questions]
    if not isinstance(answers, list): answers = [answers]
    
    global semantic_model
    if not semantic_model:
        try:
            semantic_model = SentenceTransformer('all-MiniLM-L6-v2')
        except:
            semantic_model = None

    resume_skills = extract_skills_from_text(resume_content)
    
    for q, a in zip(questions, answers):
        score = 0
        feedback_parts = []
        ans_text = str(a).strip()
        
        # STRICT CHECK FOR UNANSWERED
        if not ans_text or len(ans_text.split()) < 3 or "no answer provided" in ans_text.lower():
            individual_scores.append(0)
            individual_feedback.append("No answer provided.")
            continue

        # CORE AI SCORING
        if semantic_model:
            q_emb = semantic_model.encode(q, convert_to_tensor=True)
            a_emb = semantic_model.encode(ans_text, convert_to_tensor=True)
            
            similarity = float(util.cos_sim(q_emb, a_emb)[0][0])
            
            if similarity > 0.55: 
                score = 8  
                feedback_parts.append("Highly relevant answer.")
            elif similarity > 0.45: 
                score = 6  
                feedback_parts.append("Relevant, but could be more specific.")
            elif similarity > 0.35: 
                score = 4  
                feedback_parts.append("Somewhat vague. Address the specific concept.")
            elif similarity > 0.25: 
                score = 2 
                feedback_parts.append("Off-topic or weak relation.")
            else: 
                score = 0  
                feedback_parts.append("Incorrect or irrelevant answer.")
        else:
            score = 5
            feedback_parts.append("AI unavailable.")

        # CONTEXT BONUS
        q_words = set(re.findall(r'\w+', q.lower()))
        a_words = set(re.findall(r'\w+', ans_text.lower()))
        common_words = q_words.intersection(a_words)
        meaningful_overlap = [w for w in common_words if len(w) > 3]
        
        if len(meaningful_overlap) >= 1:
            score += 1
            
        # STAR METHOD BONUS
        if score >= 4:
            star_keywords = ['situation', 'task', 'action', 'result', 'solved', 'led', 'achieved']
            if any(w in ans_text.lower() for w in star_keywords):
                score += 1
                feedback_parts.append("Good use of action verbs.")

        final_score = min(10, max(0, score))
        
        final_feedback_text = " ".join(feedback_parts)
        if final_score == 0 and not final_feedback_text:
            final_feedback_text = "Answer does not appear relevant to the question."

        individual_scores.append(final_score)
        individual_feedback.append(final_feedback_text)
        
    return {
        "individual_scores": individual_scores,
        "individual_feedback": individual_feedback,
        "transcribed_text": transcribed_text or answers[0]
    }

load_models()