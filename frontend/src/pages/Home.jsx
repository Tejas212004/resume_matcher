import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useResume } from "../context/ResumeContext"; // ✅ import global context

export default function Home() {
  const [resume, setResume] = useState(null);
  const [jdFile, setJdFile] = useState(null);
  const [jdText, setJdText] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const { setResumeData } = useResume(); // ✅ get context setter

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!resume || (!jdFile && !jdText)) {
      alert("Please upload resume and provide job description (file or text)");
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append("resume", resume);

    if (jdFile) {
      formData.append("jd", jdFile);
    } else {
      const blob = new Blob([jdText], { type: "text/plain" });
      formData.append("jd", blob, "jd.txt");
    }

    try {
      const res = await fetch("http://127.0.0.1:8000/match", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Failed to get results from backend");
      }

      const data = await res.json();

      // ✅ Store resume, JD, and result globally
      setResumeData({
        resume: resume,
        jd: jdFile || jdText,
        result: data,
      });

      // ✅ Navigate correctly with state
      navigate("/result", { state: { result: data } });
    } catch (err) {
      console.error(err);
      alert("Error connecting to backend");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-8 rounded-2xl shadow-md max-w-xl mx-auto mt-10">
      <h1 className="text-2xl font-semibold text-gray-800 mb-4 text-center">
        Skill-Based Resume Matcher
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Resume Upload */}
        <div>
          <label className="block mb-1 font-medium">Upload Resume</label>
          <input
            type="file"
            accept=".pdf,.docx,.txt"
            onChange={(e) => setResume(e.target.files[0])}
            className="border p-2 w-full rounded"
          />
        </div>

        {/* JD Upload or Text */}
        <div>
          <label className="block mb-1 font-medium">
            Job Description (File or Text)
          </label>
          <input
            type="file"
            accept=".pdf,.docx,.txt"
            onChange={(e) => setJdFile(e.target.files[0])}
            className="border p-2 w-full rounded mb-2"
          />
          <textarea
            rows="5"
            placeholder="Or paste job description text here..."
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
            className="border p-2 w-full rounded"
          ></textarea>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 w-full transition"
        >
          {loading ? "Matching..." : "Match Skills"}
        </button>
      </form>
    </div>
  );
}
