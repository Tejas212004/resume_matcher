import React, { useState, useEffect } from "react";
import { useResume } from "../context/ResumeContext";

export default function MockInterview() {
  const { resumeData } = useResume();
  const [resume, setResume] = useState(null);
  const [jd, setJd] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [timeLeft, setTimeLeft] = useState(null); // seconds
  const [isTimeUp, setIsTimeUp] = useState(false);

  // ⏱ Countdown timer effect
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsTimeUp(true);
          handleEvaluate(); // auto submit
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  // 🎯 Generate Interview Questions
  const handleGenerate = async () => {
    let finalResume = resumeData.resume || resume;
    let finalJd = resumeData.jd || jd;

    if (!finalResume) {
      setError("Please upload your resume first or complete the skill match step.");
      return;
    }

    setError("");
    setFeedback(null);
    setQuestions([]);
    setAnswers({});
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("resume", finalResume);
      if (finalJd) formData.append("jd", finalJd);

      const res = await fetch("http://127.0.0.1:8000/interview/generate", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Failed to generate interview questions.");
      const data = await res.json();

      if (data.questions?.length) {
        setQuestions(data.questions);
        setTimeLeft(5 * 60); // ⏱ 5 minutes timer
        setIsTimeUp(false);
      } else {
        setError("No questions were generated. Try uploading a different resume or JD.");
      }
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 🧠 Evaluate Answers
  const handleEvaluate = async () => {
    if (questions.length === 0) return;
    if (Object.keys(answers).length === 0) {
      setError("Please answer at least one question before submitting.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const res = await fetch("http://127.0.0.1:8000/interview/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questions: questions,
          answers: questions.map((q) => answers[q] || ""),
        }),
      });

      if (!res.ok) throw new Error("Failed to evaluate answers.");
      const data = await res.json();
      setFeedback(data);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4 text-center text-blue-700">
        Mock Interview
      </h1>

      {/* Upload Section */}
      {!resumeData.resume && (
        <div className="flex flex-col space-y-3 mb-6 bg-gray-50 p-4 rounded-lg shadow-sm">
          <label className="font-medium">Upload Resume (PDF/DOCX):</label>
          <input
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={(e) => setResume(e.target.files[0])}
            className="border p-2 rounded"
          />
          <label className="font-medium">Upload Job Description (optional):</label>
          <input
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={(e) => setJd(e.target.files[0])}
            className="border p-2 rounded"
          />
        </div>
      )}

      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={loading}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400 transition w-full"
      >
        {loading ? "Generating..." : "Generate Questions"}
      </button>

      {/* Error Message */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 p-3 rounded mt-4">
          {error}
        </div>
      )}

      {/* Questions Section */}
      {questions.length > 0 && (
        <div className="mt-6">
          {/* Countdown Clock */}
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-xl font-semibold text-gray-800">Interview Questions</h2>
            <div
              className={`font-bold text-lg px-3 py-1 rounded ${
                timeLeft <= 30 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
              }`}
            >
              ⏱ {formatTime(timeLeft || 0)}
            </div>
          </div>

          {isTimeUp && (
            <div className="text-red-600 font-semibold mb-3">
              Time’s up! Auto-submitting your answers...
            </div>
          )}

          {questions.map((q, idx) => (
            <div key={idx} className="mb-5">
              <p className="font-medium">{idx + 1}. {q}</p>
              <textarea
                className="w-full border p-2 mt-2 rounded"
                rows="3"
                placeholder="Your answer..."
                onChange={(e) => setAnswers({ ...answers, [q]: e.target.value })}
              />
            </div>
          ))}

          {/* Manual Submit (if user finishes early) */}
          {!isTimeUp && (
            <button
              onClick={handleEvaluate}
              disabled={loading}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-400 transition"
            >
              {loading ? "Evaluating..." : "Submit Answers"}
            </button>
          )}
        </div>
      )}

      {/* Feedback Section */}
      {feedback && (
        <div className="mt-8 p-4 border rounded-lg shadow-sm bg-green-50">
          <h3 className="text-lg font-semibold mb-2 text-green-700">Interview Feedback</h3>
          <p className="font-medium">Average Score: {feedback.average_score}%</p>
          <ul className="mt-2 list-disc list-inside text-gray-700">
            {feedback.feedback.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
