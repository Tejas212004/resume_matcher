# backend/app/resume_processor.py

import joblib
import re
import pandas as pd
from collections import Counter
import logging
import random # 🛑 NEW: Added for slightly more diverse placeholder Q/A

# Set the path where your models and data files are located
# NOTE: Ensure these paths are correct relative to where FastAPI starts the app.
MODELS_PATH = "app/models/"
DATA_PATH = "app/models/"

logger = logging.getLogger("resume_processor")
logger.setLevel(logging.INFO) # Ensure logger is enabled and set to INFO

# Global variables for models and data
category_model = None
job_model = None
category_vectorizer = None
job_vectorizer = None
job_descriptions_df = None
skills_data = None
skill_keywords = [
    "Python", "Java", "JavaScript", "SQL", "React", "Node.js", "Django", "Flask", 
    "AWS", "Azure", "Machine Learning", "Data Analysis", "NLP", "Communication", 
    "Leadership", "Teamwork", "Problem Solving", "TensorFlow", "PyTorch", "Pandas",
    "Scikit-learn", "Docker", "Kubernetes", "C++", "HTML", "CSS", "Git",
]

# --- Helper Functions for Text Cleaning and Extraction ---

def clean_text(text):
    """Standard text cleaning."""
    if not text:
        return ""
    text = str(text).lower() # Ensure text is a string
    text = re.sub(r'[^a-z0-9\s]', '', text) # Remove special characters
    text = re.sub(r'\s+', ' ', text).strip() # Remove extra whitespace
    return text

def extract_contact_info(text):
    """Extracts name, email, and phone number using regex."""
    # Simple Name Extraction (usually the first line/block, case-insensitive)
    # Improved Name Regex: Looks for 2-4 Title-cased words at the start of a line
    name_match = re.search(r"^\s*([A-Z][a-z]+(?: [A-Z][a-z]+){1,3})", text.strip(), re.MULTILINE)
    name = name_match.group(1) if name_match else "Candidate Name N/A"

    # Email Extraction
    email_match = re.search(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b", text)
    email = email_match.group(0) if email_match else "N/A"

    # Phone Number Extraction (various common formats, looking for 7+ digits)
    phone_match = re.search(r"(\(?\d{3}\)?)?\s*[-.\s]?\d{3}\s*[-.\s]?\d{4}(?!\d)", text)
    phone = phone_match.group(0).strip() if phone_match else "N/A"

    return name, email, phone

def extract_education(text):
    """Simple regex-based education extraction."""
    education_keywords = r"(?:b\.?s\.?|m\.?s\.?|ph\.?d\.?|master'?s|bachelor'?s|university|college|institute|degree|diploma)"
    # Pattern looks for the keyword, then captures content until a newline or end of section
    education_pattern = re.compile(f"({education_keywords}.*?)(?:\n\n|\n\s*[A-Z]|$)", re.IGNORECASE | re.DOTALL) 
    
    matches = education_pattern.findall(text)
    
    # Clean up and return unique entries
    cleaned_matches = {re.sub(r'\s+', ' ', m[0].strip()) for m in matches if len(m[0].strip()) > 10}
    return list(cleaned_matches)[:3] 


def extract_skills_from_text(text):
    """Extract skills from text based on the global keyword list."""
    text_lower = clean_text(text)
    # Use word boundaries (\b) to ensure full word match
    found = {skill for skill in skill_keywords if re.search(rf"\b{re.escape(skill.lower())}\b", text_lower)}
    return list(found)


# --- ML Model Loading ---

def load_models():
    """Load all necessary ML models and data. Returns True if core models load."""
    global category_model, job_model, category_vectorizer, job_vectorizer, job_descriptions_df, skills_data
    
    model_loaded = True
    try:
        # Load CORE Models
        category_model = joblib.load(MODELS_PATH + "rf_classifier_categorization.pkl")
        category_vectorizer = joblib.load(MODELS_PATH + "tfidf_vectorizer_categorization.pkl")
        job_model = joblib.load(MODELS_PATH + "rf_classifier_job_recommendation.pkl")
        job_vectorizer = joblib.load(MODELS_PATH + "tfidf_vectorizer_job_recommendation.pkl")

        # Load SUPPLEMENTARY Data (Non-critical, uses try/except)
        try:
            # Added check for encoding
            job_descriptions_df = pd.read_csv(DATA_PATH + "job_descriptions.csv", encoding='latin1', on_bad_lines='skip') 
            skills_data = pd.read_csv(DATA_PATH + "job_title_des.csv", encoding='latin1', on_bad_lines='skip')
        except FileNotFoundError as fnf:
            logger.warning(f"Supplementary data file not found (non-critical): {fnf}")
        except Exception as e:
            logger.warning(f"Error loading supplementary data: {e}")
            
        logger.info("ML Models and vectorizers loaded successfully.")
    except FileNotFoundError as fnf:
        logger.error(f"CRITICAL: Required ML model file not found. Analysis will fail: {fnf}")
        model_loaded = False
    except Exception as e:
        logger.error(f"CRITICAL: Error loading ML models: {e}")
        model_loaded = False
        
    return model_loaded


# --- Core Prediction Functions ---

def predict_category(text):
    """Predicts the broad category of the resume."""
    if not category_model or not category_vectorizer:
        return "Model Not Loaded"
    
    text_cleaned = clean_text(text)
    if not text_cleaned:
        return "Empty Text Input"

    try:
        features = category_vectorizer.transform([text_cleaned])
        prediction = category_model.predict(features)
        return prediction[0]
    except Exception as e:
        logger.error(f"Prediction failed for category: {e}")
        return "Prediction Error"


def generate_recommendation(text):
    """Generates a job recommendation based on the resume."""
    if not job_model or not job_vectorizer:
        return "Model Not Loaded"
    
    text_cleaned = clean_text(text)
    if not text_cleaned:
        return "Empty Text Input"

    try:
        features = job_vectorizer.transform([text_cleaned])
        prediction = job_model.predict(features)
        return prediction[0]
    except Exception as e:
        logger.error(f"Prediction failed for recommendation: {e}")
        return "Prediction Error"


# --- Logic for ATS Score and Tips ---

def calculate_ats_score(text, recommended_job, extracted_skills):
    """
    Calculates a simulated ATS score based on length, formatting, and relevance.
    """
    score = 0
    
    # 1. Length/Format (Max 30 pts)
    word_count = len(text.split())
    if 300 <= word_count <= 800:
        score += 30 # Optimal length
    elif 200 <= word_count <= 1000:
        score += 20
    else:
        score += 10
    
    # 2. Keywords/Relevance (Max 40 pts)
    # Basic relevance check: how many top 5 general skills are present
    top_general_skills = ["Python", "SQL", "Communication", "Leadership", "Data Analysis"]
    relevant_skill_count = sum(1 for skill in top_general_skills if skill in extracted_skills)
    score += int((relevant_skill_count / len(top_general_skills)) * 40)
    
    # 3. Contact Info (Max 30 pts)
    name, email, phone = extract_contact_info(text)
    info_score = 0
    if name != "Candidate Name N/A": info_score += 10
    if email != "N/A": info_score += 10
    if phone != "N/A": info_score += 10
    score += info_score

    # Cap the score at 100
    return min(100, int(score))

def generate_personalized_tips(text, recommended_job, extracted_skills):
    """Generates tips based on common ATS best practices."""
    tips = []
    if len(text.split()) < 300:
        tips.append("Your resume is quite short. Consider adding more details to your experience and project sections.")
    
    # Check for quantification (e.g. numbers used in descriptive sections)
    quantified_check = re.search(r'\d+%', text) or re.search(r'over \d+ million', text.lower())
    if not quantified_check:
        tips.append("Focus on **results and achievements** over just responsibilities, using strong action verbs and **quantifying** your successes (e.g., 'Increased revenue by 15%').")

    if any(s.lower() not in text.lower() for s in ["project", "portfolio"]):
        tips.append(f"To match the competitiveness of a '{recommended_job}' role, add a dedicated section for relevant personal projects or portfolio links.")
    if not extract_education(text):
        tips.append("Ensure your **Education** section is clearly formatted with degree, institution, and graduation dates.")
        
    # Check for job-specific skills if applicable
    if skills_data is not None and recommended_job in skills_data['Category'].values:
        # Simple check for one mandatory skill
        if "Python" in skills_data[skills_data['Category'] == recommended_job]['Description'].iloc[0] and "Python" not in extracted_skills:
             tips.append(f"The role '{recommended_job}' heavily uses **Python**. Make sure your proficiency is highlighted.")
             
    return tips or ["Your resume looks well-structured! Focus on tailoring it to specific job descriptions."]


# --- Skill Gap and Future Skill Analysis ---

def analyze_skill_gap_and_future(recommended_job, extracted_skills):
    """Identifies missing skills and suggests future skills based on the job title."""
    missing_skills = []
    future_skills = []
    
    # 1. Find common skills for the recommended job (Simulated)
    # Check if skills_data is a DataFrame before use
    if isinstance(skills_data, pd.DataFrame) and recommended_job in skills_data['Category'].values:
        job_row = skills_data[skills_data['Category'] == recommended_job].iloc[0]
        
        # Use the 'Description' column as a source for required skills (must be lower case for clean matching)
        required_skills_text = clean_text(job_row['Description']) 
        required_skills_for_job = extract_skills_from_text(required_skills_text)
        
        # Filter out common soft skills before presenting missing skills
        soft_skills = ["teamwork", "communication", "leadership", "problem solving"]
        missing_skills = [
            skill for skill in required_skills_for_job 
            if skill not in extracted_skills and skill.lower() not in soft_skills
        ][:4] # Limit to top 4 missing

    # 2. Future Skills (Based on category trends)
    if "Data" in recommended_job or "Analyst" in recommended_job or "ML" in recommended_job:
        future_skills = ["Advanced R", "Cloud Data Warehousing (Snowflake)", "MLOps"]
    elif "Developer" in recommended_job or "Engineer" in recommended_job or "DevOps" in recommended_job:
        future_skills = ["Go Language", "Microservices Architecture", "Advanced Kubernetes"]
    else:
        future_skills = ["Professional Networking", "Advanced Presentation Skills"]

    return missing_skills, future_skills[:3]


# --- Radar Chart Data Generation (Simulated) ---

def generate_radar_data(extracted_skills, recommended_job):
    """Creates a simulated data structure for a radar chart based on key areas."""
    
    # Define key assessment areas
    areas = {
        "Technical Depth": ["Python", "Java", "SQL", "Docker"],
        "ML/Data Science": ["Machine Learning", "NLP", "PyTorch", "Pandas"],
        "Cloud/DevOps": ["AWS", "Azure", "Kubernetes", "Git"],
        "Soft Skills": ["Communication", "Leadership", "Teamwork"],
    }
    
    radar_chart_data = []
    
    for area, skills_list in areas.items():
        score_sum = 0
        for skill in skills_list:
            if skill in extracted_skills:
                # Give a base score of 80 for presence
                score_sum += 80 
            else:
                # Give a lower score for absence
                score_sum += 40 

        # Average the score and adjust slightly based on job relevance
        avg_score = score_sum / len(skills_list)
        
        # Final Score (out of 100)
        final_score = min(100, int(avg_score))
        
        radar_chart_data.append({"skill": area, "score": final_score})

    return radar_chart_data


# --- INTERNAL HELPER FOR ERROR STRUCTURE ---

def _get_empty_analysis_result(error_message, resume_content_text=""):
    """Returns a structure with default/null values to match frontend expectation on failure."""
    return {
        "ats_score": 0,
        "predicted_category": "Error",
        "recommended_job": "Error",
        "name": "N/A",
        "email": "N/A",
        "phone": "N/A",
        "extracted_skills": [],
        "extracted_education": [],
        "personalized_tips": [f"Analysis failed: {error_message}. Please check server logs and ensure ML models are present."],
        "missing_skills": [],
        "future_skills": [],
        "interview_questions": ["Analysis failed. Please try a different resume file or check the backend server."],
        "radar_data": [{"skill": "Technical Depth", "score": 0}, {"skill": "ML/Data Science", "score": 0}, {"skill": "Cloud/DevOps", "score": 0}, {"skill": "Soft Skills", "score": 0}],
        # 🛑 CRITICAL: Ensure this field is present, even if empty/error
        "resume_content_text": resume_content_text 
    }


# --- MAIN ATS ANALYSIS FUNCTION (Orchestrates Analysis with Error Guards) ---

def perform_ats_analysis(resume_text):
    """Orchestrates all analysis steps and returns a structured result."""
    
    if not resume_text or len(resume_text.strip()) < 50:
        logger.error("Resume text is empty or too short for analysis.")
        return _get_empty_analysis_result("Resume text is empty or corrupt.", resume_text) # Pass text back

    try:
        # 1. Core Extraction
        name, email, phone = extract_contact_info(resume_text)
        extracted_skills = extract_skills_from_text(resume_text)
        extracted_education = extract_education(resume_text)
        
        # 2. ML Prediction
        predicted_category = predict_category(resume_text)
        recommended_job = generate_recommendation(resume_text)

        # CRITICAL CHECK: If ML prediction fails, return an error state
        if "Model Not Loaded" in predicted_category or "Prediction Error" in predicted_category:
            logger.error(f"ML Models failed to predict. Category: {predicted_category}, Job: {recommended_job}")
            return _get_empty_analysis_result(f"ML Model Failure: {predicted_category}", resume_text)
        
        
        # 3. Scoring and Gaps
        ats_score = calculate_ats_score(resume_text, recommended_job, extracted_skills)
        personalized_tips = generate_personalized_tips(resume_text, recommended_job, extracted_skills)
        missing_skills, future_skills = analyze_skill_gap_and_future(recommended_job, extracted_skills)
        
        # 4. Interview Prep 
        job_placeholder = recommended_job if recommended_job not in ["Model Not Loaded", "Prediction Error"] else "your target field"
        
        # Dynamic question selection
        tech_skill = random.choice([s for s in extracted_skills if s not in ["Communication", "Leadership"]]) if len(extracted_skills) > 3 else 'technical skills'
        
        interview_questions = [
            f"Tell me about a challenging project related to {job_placeholder} that you worked on.",
            f"How do you ensure code quality or data accuracy in a {predicted_category} environment?",
            f"What is your experience with {tech_skill} and how have you applied it recently?",
            "Why are you interested in this specific career path and our industry?",
            "Describe a time you had to deal with conflict or disagreement on a team." # Added a standard behavioral question
        ]
        
        # 5. Visualization Data
        radar_data = generate_radar_data(extracted_skills, recommended_job)

        # 6. Final Return Structure
        return {
            "ats_score": ats_score,
            "predicted_category": predicted_category,
            "recommended_job": recommended_job,
            "name": name,
            "email": email,
            "phone": phone,
            "extracted_skills": extracted_skills,
            "extracted_education": extracted_education,
            "personalized_tips": personalized_tips,
            "missing_skills": missing_skills,
            "future_skills": future_skills,
            "interview_questions": interview_questions,
            "radar_data": radar_data,
            # 🛑 CRITICAL: MUST INCLUDE THE FULL TEXT for the next step (interview evaluation)
            "resume_content_text": resume_text 
        }
    except Exception as e:
        logger.error(f"FATAL error during ATS analysis: {e}")
        return _get_empty_analysis_result(f"FATAL Server Error: {e}", resume_text)


# --- INTERVIEW EVALUATION FUNCTION (FOR BOTH TEXT AND AUDIO) ---
# 🛑 CORRECTED: Added transcribed_text to the signature for consistency and logic.

def evaluate_interview_answers(questions, answers, resume_content, transcribed_text=None):
    """
    Simulates LLM-based scoring for interview answers (text-based evaluation logic).
    
    This function handles both single Q/A pair submissions (for real-time evaluation)
    and lists of Q/A pairs (for legacy/bulk evaluation).
    The 'answers' parameter must contain the text to be evaluated.
    """
    individual_scores = []
    individual_feedback = []
    overall_feedback = []
    
    # Normalize input: always work with lists of Q/A pairs
    # If the call is for a single question (as in the text evaluation endpoint), wrap the single item
    if not isinstance(questions, list): questions = [questions]
    if not isinstance(answers, list): answers = [answers]
    # transcribed_text is not used in the score calculation but must be returned
    
    if not questions or not answers or len(questions) != len(answers):
        return {
            "individual_scores": [],
            "individual_feedback": [],
            "feedback": ["No questions or answers were submitted for evaluation."],
            "transcribed_text": transcribed_text or answers[0] if answers else ""
        }
    
    resume_skills = extract_skills_from_text(resume_content)
    
    for i, (q, a) in enumerate(zip(questions, answers)):
        score = 0
        feedback = "Answer too short or not provided. Please elaborate on your experience."
        
        answer_text = str(a).strip()
        
        # 1. Base Score (Max 3 pts - requires at least 15 characters)
        if len(answer_text) > 15: 
            score = 3
            feedback = "Very brief answer. Needs more detail and contextual examples."
        
        # 2. Medium Score (Max 7 pts - requires length and skill linkage)
        # Using a longer length check here for better score differentiation
        if len(answer_text) > 50 and any(skill.lower() in answer_text.lower() for skill in resume_skills):
            score = 7 
            feedback = "Good answer, linking experience back to your resume skills. Needs more structure (e.g., STAR method)."
            
        # 3. High Score (Max 10 pts - requires quantified results/STAR method keywords)
        if len(answer_text) > 100 and re.search(r'\d+', answer_text) and re.search(r'\b(increased|reduced|managed|result|achieved)\b', answer_text.lower()):
            score = 9
            feedback = "Excellent use of quantified results and specific examples (STAR method detected). Very compelling."
            
        # 4. Catch the 'silly answer' scenario (less than 5 words)
        if len(answer_text.split()) < 5 and len(answer_text) > 0:
            score = min(score, 2) # Force score down to max 2 if the answer is too short (less than 5 words)
            if score <= 2:
                feedback = "Answer is far too short. Please provide a detailed, multi-sentence response."

        # Final safety cap
        score = min(10, score)

        individual_scores.append(score)
        individual_feedback.append(feedback)

    # Generate overall feedback ONLY if multiple questions were submitted (legacy path)
    if len(questions) > 1:
        if individual_scores:
            avg_score = sum(individual_scores) / len(individual_scores)
        else:
            avg_score = 0
            overall_feedback.append("Evaluation failed due to missing or invalid answers.")
            
        if not overall_feedback:
            if avg_score >= 7.5:
                overall_feedback.append("Outstanding performance! Your answers were relevant, detailed, and directly linked to your resume.")
            elif avg_score >= 5:
                overall_feedback.append("Solid effort. Your answers covered the basics, but try to use the STAR method (Situation, Task, Action, Result) for behavioral questions.")
            else:
                overall_feedback.append("Your responses were too brief or lacked specific evidence. Review your resume and practice elaborating.")

    # Return structure is crucial for the frontend
    return {
        "individual_scores": individual_scores,
        "individual_feedback": individual_feedback,
        # Only return overall feedback if it was generated (i.e., for bulk submission)
        "feedback": overall_feedback, 
        # 🛑 CRITICAL: Return the text evaluated. For audio, this is the transcription. For text submission, it's the answer.
        "transcribed_text": transcribed_text or answers[0] if answers else "" 
    }

# Call load_models at the end of the file to load the models when the module is imported
if not load_models():
    logger.error("Resume processor started but critical models are missing. Analysis calls will return structured error data.")