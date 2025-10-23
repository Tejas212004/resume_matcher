import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function UploadPage() {
  const [resume, setResume] = useState(null);
  const [jd, setJd] = useState(null);
  const [jdText, setJdText] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!resume) {
      alert("Please upload a resume file.");
      return;
    }

    const formData = new FormData();
    formData.append("resume", resume);
    if (jd) formData.append("jd", jd);
    if (jdText) formData.append("jd_text", jdText);

    try {
      setLoading(true);
      const res = await fetch("http://127.0.0.1:8000/match", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      setLoading(false);

      if (data.error) {
        alert(data.error);
        return;
      }

      navigate("/result", { state: { result: data } });
    } catch (error) {
      console.error(error);
      setLoading(false);
      alert("Error connecting to backend.");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-100 transition-all">
      <form
        onSubmit={handleSubmit}
        className="bg-white shadow-xl rounded-2xl p-8 w-full max-w-lg border border-gray-100"
      >
        <h2 className="text-2xl font-semibold mb-6 text-center text-blue-700">
          Upload Resume & Job Description
        </h2>

        <label className="block mb-2 font-medium text-gray-700">Upload Resume</label>
        <input
          type="file"
          accept=".pdf,.docx,.txt"
          onChange={(e) => setResume(e.target.files[0])}
          className="w-full border rounded p-2 mb-4 focus:ring focus:ring-blue-200"
        />

        <label className="block mb-2 font-medium text-gray-700">Upload Job Description</label>
        <input
          type="file"
          accept=".pdf,.docx,.txt"
          onChange={(e) => setJd(e.target.files[0])}
          className="w-full border rounded p-2 mb-4 focus:ring focus:ring-blue-200"
        />

        <label className="block mb-2 font-medium text-gray-700">Or Paste Job Description</label>
        <textarea
          placeholder="Paste job description here..."
          onChange={(e) => setJdText(e.target.value)}
          value={jdText}
          className="w-full border rounded p-2 mb-6 focus:ring focus:ring-blue-200"
          rows="4"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white font-semibold py-2 rounded-lg hover:bg-blue-700 transition"
        >
          {loading ? (
            <div className="flex justify-center items-center">
              <div className="w-5 h-5 border-4 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
              Processing...
            </div>
          ) : (
            "Match Skills"
          )}
        </button>
      </form>
    </div>
  );
}
