import React, { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ResumeContext } from '../context/ResumeContext'; 
import { Loader2, Zap, Clock, CheckCircle, ChevronRight, ChevronLeft, AlertTriangle, Mic, StopCircle } from 'lucide-react'; 

// Configuration
const API_URL = "http://127.0.0.1:8000";
const TOTAL_TIME_MINUTES = 15; 

export default function MockInterview() {
    const { resumeData } = useContext(ResumeContext); 
    const navigate = useNavigate();

    // Data
    const questions = resumeData?.analysisResult?.interview_questions || [];
    const resumeContentText = resumeData?.analysisResult?.resume_content_text || ''; 
    const resumeName = resumeData?.resume || "candidate";

    // State
    const [answers, setAnswers] = useState({}); 
    const [currentQIndex, setCurrentQIndex] = useState(0);
    const [timeLeft, setTimeLeft] = useState(TOTAL_TIME_MINUTES * 60); 
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [report, setReport] = useState(null); 
    const [error, setError] = useState("");

    // Audio State
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);

    // --- Timer Logic ---
    useEffect(() => {
        if (report) return; 
        if (timeLeft <= 0) {
            handleFinalSubmit(); 
            return;
        }
        const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
        return () => clearInterval(timer);
    }, [timeLeft, report]);

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    // --- Audio Recording Handlers ---

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = handleAudioStop;
            mediaRecorder.start();
            setIsRecording(true);
            setError("");
        } catch (err) {
            console.error("Microphone Error:", err);
            setError("Could not access microphone. Please type your answer.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            // Stop all tracks to release microphone
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        }
    };

    const handleAudioStop = async () => {
        setIsTranscribing(true);
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio_file', audioBlob, 'answer.webm');
        formData.append('resume_name', resumeName);
        formData.append('current_question', questions[currentQIndex]);

        try {
            // We reuse the existing endpoint just to get the transcription
            const res = await fetch(`${API_URL}/interview/evaluate_audio`, {
                method: 'POST',
                body: formData,
            });

            if (!res.ok) throw new Error("Transcription failed");
            
            const data = await res.json();
            // Append transcribed text to existing answer
            const newText = (answers[currentQIndex] || "") + " " + data.transcribed_text;
            setAnswers(prev => ({ ...prev, [currentQIndex]: newText.trim() }));

        } catch (err) {
            console.error("Transcription Error:", err);
            setError("Failed to transcribe audio. Please try again or type.");
        } finally {
            setIsTranscribing(false);
        }
    };

    // --- General Handlers ---

    const handleAnswerChange = (text) => {
        setAnswers(prev => ({ ...prev, [currentQIndex]: text }));
    };

    const handleFinalSubmit = async () => {
        setIsSubmitting(true);
        setError("");

        // Prepare Payload
        const qaPairs = questions.map((q, idx) => ({
            question: q,
            answer: answers[idx] || "No answer provided." 
        }));

        try {
            const response = await fetch(`${API_URL}/interview/evaluate_bulk`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    resume_content: resumeContentText,
                    qa_pairs: qaPairs
                })
            });

            if (!response.ok) throw new Error("Evaluation failed.");
            const data = await response.json();
            setReport(data); 

        } catch (err) {
            console.error(err);
            setError("Failed to submit interview. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- RENDER: REPORT CARD ---
    if (report) {
        return (
            <div className="container mx-auto p-4 md:p-8 max-w-4xl">
                <div className="bg-white rounded-2xl shadow-2xl border border-green-100 overflow-hidden">
                    <div className="bg-gradient-to-r from-green-600 to-teal-600 p-8 text-white text-center">
                        <h1 className="text-4xl font-bold mb-2">Interview Completed!</h1>
                        <p className="opacity-90 text-lg">Here is your AI-generated performance analysis.</p>
                    </div>
                    
                    <div className="p-8">
                        <div className="text-center mb-12">
                            <div className="inline-block p-8 rounded-full bg-green-50 border-8 border-green-100 mb-4 shadow-inner">
                                <span className="text-6xl font-extrabold text-green-700">{report.overall_score}</span>
                                <span className="text-2xl text-green-600 font-medium">/10</span>
                            </div>
                            <h2 className="text-2xl font-semibold text-gray-800">Overall Performance Score</h2>
                        </div>

                        <div className="space-y-8">
                            {questions.map((q, i) => (
                                <div key={i} className="border border-gray-200 rounded-xl p-6 bg-white shadow-sm">
                                    <div className="flex justify-between items-start mb-4 border-b pb-2">
                                        <h3 className="font-bold text-lg text-gray-800 w-3/4">Q{i + 1}: {q}</h3>
                                        <span className={`px-4 py-1 rounded-full text-sm font-bold 
                                            ${report.individual_scores[i] >= 7 ? 'bg-green-100 text-green-800' : 
                                              report.individual_scores[i] >= 4 ? 'bg-yellow-100 text-yellow-800' : 
                                              'bg-red-100 text-red-800'}`}>
                                            Score: {report.individual_scores[i]}/10
                                        </span>
                                    </div>
                                    <div className="grid md:grid-cols-2 gap-6">
                                        <div>
                                            <p className="text-xs font-bold text-gray-400 uppercase mb-1">Your Answer:</p>
                                            <div className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg border border-gray-100 h-full">
                                                {answers[i] || "No answer provided."}
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-blue-500 uppercase mb-1">AI Feedback:</p>
                                            <div className="text-sm text-blue-900 bg-blue-50 p-3 rounded-lg border border-blue-100 h-full">
                                                <Zap className="w-4 h-4 inline mr-1 mb-1" />
                                                {report.individual_feedback[i]}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button onClick={() => navigate('/')} className="mt-10 w-full bg-gray-800 text-white py-4 rounded-xl hover:bg-gray-900 transition font-bold text-lg shadow-lg">Start New Analysis</button>
                    </div>
                </div>
            </div>
        );
    }

    if (!resumeData || !resumeData.analysisResult) return <div className="flex flex-col items-center justify-center h-screen"><p className="text-gray-500 mb-4">No interview data found.</p><button onClick={() => navigate('/')} className="text-blue-600 underline">Go Home</button></div>;

    // --- RENDER: EXAM INTERFACE ---
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center pt-10 px-4">
            <div className="fixed top-20 right-4 md:right-10 bg-white px-4 py-2 rounded-full shadow-md border border-gray-200 flex items-center gap-2 z-10">
                <Clock className={`w-5 h-5 ${timeLeft < 60 ? 'text-red-500 animate-pulse' : 'text-blue-600'}`} />
                <span className={`font-mono text-xl font-bold ${timeLeft < 60 ? 'text-red-600' : 'text-gray-800'}`}>{formatTime(timeLeft)}</span>
            </div>

            <div className="w-full max-w-3xl">
                <div className="mb-6">
                    <div className="flex justify-between text-sm font-medium text-gray-500 mb-2">
                        <span>Question {currentQIndex + 1} of {questions.length}</span>
                        <span>{Math.round(((currentQIndex + 1) / questions.length) * 100)}% Completed</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-500 ease-out" style={{ width: `${((currentQIndex + 1) / questions.length) * 100}%` }} ></div>
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden min-h-[500px] flex flex-col relative">
                    <div className="p-8 flex-grow flex flex-col">
                        <h2 className="text-2xl font-bold text-gray-800 mb-6 leading-snug">{questions[currentQIndex]}</h2>
                        
                        <div className="relative flex-grow">
                            <textarea
                                className="w-full h-full p-5 pb-16 border border-gray-300 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 resize-none text-lg text-gray-700 placeholder-gray-400 transition-all"
                                placeholder="Type your answer here or use the microphone..."
                                value={answers[currentQIndex] || ''}
                                onChange={(e) => handleAnswerChange(e.target.value)}
                                disabled={isTranscribing || isRecording}
                            ></textarea>
                            
                            {/* Microphone Button (Floating inside TextArea) */}
                            <button 
                                onClick={isRecording ? stopRecording : startRecording}
                                disabled={isTranscribing}
                                className={`absolute bottom-4 right-4 p-3 rounded-full shadow-lg transition-all transform hover:scale-110 
                                    ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-blue-600 text-white hover:bg-blue-700'}
                                    ${isTranscribing ? 'bg-gray-400 cursor-not-allowed' : ''}
                                `}
                                title={isRecording ? "Stop Recording" : "Start Recording"}
                            >
                                {isTranscribing ? <Loader2 className="w-6 h-6 animate-spin" /> : isRecording ? <StopCircle className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                            </button>
                        </div>
                        {isTranscribing && <p className="text-sm text-blue-600 font-medium mt-2 animate-pulse">Transcribing audio...</p>}
                    </div>

                    <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
                        <button onClick={() => setCurrentQIndex(prev => Math.max(0, prev - 1))} disabled={currentQIndex === 0} className="flex items-center px-5 py-2.5 text-gray-600 font-semibold rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition"><ChevronLeft className="w-5 h-5 mr-1" /> Previous</button>
                        {currentQIndex < questions.length - 1 ? (
                            <button onClick={() => setCurrentQIndex(prev => prev + 1)} className="flex items-center px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg hover:shadow-blue-500/30 transition transform hover:-translate-y-0.5">Next Question <ChevronRight className="w-5 h-5 ml-1" /></button>
                        ) : (
                            <button onClick={handleFinalSubmit} disabled={isSubmitting} className="flex items-center px-8 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 shadow-lg hover:shadow-green-500/30 transition transform hover:-translate-y-0.5">{isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CheckCircle className="w-5 h-5 mr-2" />} Submit Interview</button>
                        )}
                    </div>
                </div>
                <div className="mt-6 text-center">
                    {error && <p className="text-red-600 font-medium flex items-center justify-center"><AlertTriangle className="w-4 h-4 mr-1"/> {error}</p>}
                </div>
            </div>
        </div>
    );
}