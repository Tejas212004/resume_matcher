import React, { createContext, useContext, useState } from "react";

// The Context object being created and exported
export const ResumeContext = createContext(); 

export function ResumeProvider({ children }) {
    // Define a comprehensive state structure to hold both old and new analysis data
    const [resumeData, setResumeData] = useState({
        resume: null, // Holds the uploaded resume file name or info
        jd: null, // Holds the uploaded JD file name or info
        
        // Core JD Match Result (from /match)
        matchResult: null, 

        // ✅ New: Comprehensive ATS/ML Analysis Result (from /analyze_resume)
        analysisResult: {
            ats_score: null, 
            recommended_job: null,
            predicted_category: null,
            name: null,
            email: null,
            phone: null,
            extracted_skills: [],
            extracted_education: [],
            personalized_tips: [],
            interview_questions: [],
            missing_skills: [],
            future_skills: [],
            radar_data: null, // For Recharts Radar Chart
        },

        // Loading and Error States
        isLoading: false,
        error: null,
        
        // Navigation helper (e.g., to navigate to results page)
        analysisComplete: false, 
    });

    // Function to reset all relevant states for a new upload
    const resetAnalysis = () => {
        setResumeData(prev => ({
            ...prev,
            resume: null,
            jd: null,
            matchResult: null,
            analysisResult: {
                ats_score: null, 
                recommended_job: null,
                predicted_category: null,
                name: null,
                email: null,
                phone: null,
                extracted_skills: [],
                extracted_education: [],
                personalized_tips: [],
                interview_questions: [],
                missing_skills: [],
                future_skills: [],
                radar_data: null,
            },
            isLoading: false,
            error: null,
            analysisComplete: false,
        }));
    };

    const contextValue = { 
        resumeData, 
        setResumeData,
        resetAnalysis, // Export the reset function for use in the Home/Upload page
    };

    return (
        <ResumeContext.Provider value={contextValue}>
            {children}
        </ResumeContext.Provider>
    );
}

// Custom hook for convenient use of the context values
export function useResume() {
    return useContext(ResumeContext);
}