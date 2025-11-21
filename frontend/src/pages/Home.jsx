import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useResume } from "../context/ResumeContext"; 
import { Loader2 } from "lucide-react"; 

// Base URL for your FastAPI backend
const API_URL = "http://127.0.0.1:8000";

export default function Home() {
  const [resume, setResume] = useState(null);
  const [jdFile, setJdFile] = useState(null);
  const [jdText, setJdText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const { setResumeData, resetAnalysis } = useResume(); 

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    
    // 1. Validation
    if (!resume) {
      setError("Please upload a resume file.");
      return;
    }

    setLoading(true);
    resetAnalysis(); // Reset previous results

    try {
      // --- A. Prepare FormData for JD Match (Call 2) ---
      const matchFormData = new FormData();
      matchFormData.append("resume", resume);

      let jdForContext = null;

      if (jdFile) {
        matchFormData.append("jd", jdFile);
        jdForContext = jdFile.name;
      } else if (jdText) {
        matchFormData.append("jd_text", jdText); 
        jdForContext = "Pasted Job Description";
      }

      // --- B. Prepare FormData for ATS Analysis (Call 1) ---
      // 🛑 UPDATED: Now sending JD to this endpoint too! 
      const analyzeFormData = new FormData();
      analyzeFormData.append("resume", resume);

      if (jdFile) {
        analyzeFormData.append("jd", jdFile);
      } else if (jdText) {
        analyzeFormData.append("jd_text", jdText);
      }

      // Perform both API calls concurrently
      const [analyzeRes, matchRes] = await Promise.all([
        // Call the new ML/ATS endpoint
        fetch(`${API_URL}/analyze_resume`, {
          method: "POST",
          body: analyzeFormData,
        }),
        // Call the existing JD Match endpoint (only if JD is provided)
        (jdFile || jdText) 
          ? fetch(`${API_URL}/match`, {
              method: "POST",
              body: matchFormData,
            })
          : Promise.resolve({ ok: true, json: () => ({ match_score: 0 }) }), // Mock response if no JD
      ]);

      // --- C. Error Handling ---
      if (!analyzeRes.ok) {
        const analyzeErrorData = await analyzeRes.json();
        throw new Error(analyzeErrorData.detail || "Failed to get ATS analysis from backend");
      }
      if ((jdFile || jdText) && !matchRes.ok) {
        const matchErrorData = await matchRes.json();
        throw new Error(matchErrorData.detail || "Failed to get JD match score from backend");
      }

      const analysisData = await analyzeRes.json();
      // Handle match data even if no JD was provided
      const matchData = (jdFile || jdText) 
        ? await matchRes.json() 
        : { match_score: 0, resume_skills: analysisData.extracted_skills || [], jd_skills: [], matched_skills: [] };

      // --- D. Store Results in Context and Navigate ---
      setResumeData(prev => ({
        ...prev,
        resume: resume.name, // Store name for display
        jd: jdForContext, // Store JD info
        matchResult: matchData, // Store match score and skills
        analysisResult: analysisData, // Store all new ATS/ML data
        analysisComplete: true,
      }));

      navigate("/result"); // Navigate to the result page
      
    } catch (err) {
      console.error("Submission Error:", err);
      setError(err.message || "An unexpected error occurred while processing your files.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-8 rounded-2xl shadow-xl max-w-xl mx-auto mt-16 border border-blue-100">
      <h1 className="text-3xl font-extrabold text-gray-900 mb-6 text-center">
        Resume Analysis & Match 
      </h1>
      <p className="text-center text-gray-600 mb-6">
        Upload your resume for a full ATS score and career analysis. Upload a JD for semantic matching.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Resume Upload */}
        <div>
          <label className="block mb-2 font-semibold text-gray-700">1. Upload Resume (PDF/DOCX/TXT)</label>
          <input
            type="file"
            accept=".pdf,.docx,.txt"
            onChange={(e) => setResume(e.target.files[0])}
            className="w-full border border-gray-300 p-3 rounded-lg file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>

        {/* JD Upload or Text */}
        <div className="border-t pt-6 border-gray-200">
          <label className="block mb-2 font-semibold text-gray-700">2. Job Description (Optional for Matching)</label>
          
          <input
            type="file"
            accept=".pdf,.docx,.txt"
            onChange={(e) => {
              setJdFile(e.target.files[0]);
              setJdText(""); // Clear text if file is uploaded
            }}
            className="w-full border border-gray-300 p-3 rounded-lg file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 mb-4"
          />
          
          <div className="flex items-center my-3">
              <span className="text-gray-500 font-medium italic mx-auto">OR</span>
          </div>

          <textarea
            rows="5"
            placeholder="Paste job description text here..."
            value={jdText}
            onChange={(e) => {
                setJdText(e.target.value);
                setJdFile(null); // Clear file if text is entered
            }}
            className="border border-gray-300 p-3 w-full rounded-lg focus:ring-blue-500 focus:border-blue-500"
          ></textarea>
        </div>
        
        {/* Error Display */}
        {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm">
                ⚠️ **Error:** {error}
            </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading || !resume}
          className={`
            flex items-center justify-center gap-2 font-bold py-3 rounded-lg w-full transition-all duration-200 
            ${loading || !resume 
                ? "bg-gray-400 cursor-not-allowed" 
                : "bg-blue-600 text-white hover:bg-blue-700 shadow-md hover:shadow-lg"
            }
          `}
        >
          {loading ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              Processing Analysis...
            </>
          ) : (
            "Analyze Resume & Match"
          )}
        </button>
      </form>
    </div>
  );
}