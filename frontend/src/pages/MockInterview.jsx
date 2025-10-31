import React, { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
// Contexts
import { ResumeContext } from '../context/ResumeContext'; 
import { Loader2, Zap, Send, Clock, Star, AlertTriangle, CheckCircle, MessageSquare } from 'lucide-react'; 
import axios from 'axios'; 

// --- Configuration ---
const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
const AUDIO_TIME_SECONDS = 60; // Per-question time limit

// Helper function to determine score color
const getScoreColor = (score) => {
    if (score >= 8) return 'text-green-600';
    if (score >= 5) return 'text-yellow-600';
    return 'text-red-600';
};

export default function MockInterview() {
    // Context
    const { resumeData } = useContext(ResumeContext); 
    const navigate = useNavigate();

    // Initial data extraction (memoized)
    const initialQuestions = resumeData?.analysisResult?.interview_questions || [];
    const resumeFileName = resumeData?.resume;
    const resumeContentText = resumeData?.analysisResult?.resume_content_text || ''; 

    // --- Component State ---
    const [questions, setQuestions] = useState(initialQuestions); // Initial state is set via the data extraction above
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    
    // State for Audio Recording
    const [isRecording, setIsRecording] = useState(false);
    const [mediaRecorder, setMediaRecorder] = useState(null);
    // Holds the index of the question currently being answered (via audio or text input)
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(null); 
    const [questionTimeLeft, setQuestionTimeLeft] = useState(AUDIO_TIME_SECONDS);
    
    // State for Text Input and Mode Toggle
    // typedAnswer will only store the text for the currentQuestionIndex that is in 'text' mode.
    const [typedAnswer, setTypedAnswer] = useState(''); 
    // Stores the mode for each question by index: {0: 'audio', 1: 'text', ...}
    const [inputMode, setInputMode] = useState({}); 

    // State to accumulate results and final feedback
    // Structure: { [questionText]: { score, feedback, text, isAnswered } }
    const [results, setResults] = useState({}); 
    const [finalFeedback, setFinalFeedback] = useState(null); 

    // Ref to hold the stream so we can stop tracks outside of the useEffect's scope
    const audioStreamRef = useRef(null); 

    // --- Navigation & Data Check Effect ---
    useEffect(() => {
        // Redirect if essential data is missing
        if (!resumeData || !resumeData.analysisResult) {
            navigate('/');
        }
    }, [resumeData, navigate]);

    // --- Helper Functions for Text Input ---
    
    // Get the current mode for a question (defaults to 'audio')
    const getMode = useCallback((qIndex) => inputMode[qIndex] || 'audio', [inputMode]);
    
    // Toggle the mode and manage the active index/typed answer
    const toggleMode = (qIndex) => {
        // Only allow toggle if not currently recording/evaluating or answered
        if (loading || isRecording || results[questions[qIndex]]) return;
        
        setTypedAnswer(''); // Clear input on switch
        setCurrentQuestionIndex(null); // Clear active question index on toggle

        // Toggle logic
        setInputMode(prev => ({
            ...prev,
            [qIndex]: getMode(qIndex) === 'audio' ? 'text' : 'audio'
        }));
    };

    // --- Core Audio Handlers (useCallback for stability) ---

    // 4. Send Audio and Receive Feedback Handler (Wrapped in useCallback)
    const sendAudioForEvaluation = useCallback(async (chunks, index) => {
        setLoading(true);
        setError(""); 
        
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        const formData = new FormData();
        const currentQuestionText = questions[index];

        formData.append('resume_name', resumeFileName || 'N/A');
        formData.append('current_question', currentQuestionText); 
        formData.append('audio_file', audioBlob, `answer_q${index}.webm`); 
        
        try {
            const res = await axios.post(`${API_URL}/interview/evaluate_audio`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });

            const data = res.data;
            
            // Use defensive access for score/feedback
            const receivedScore = data.score || data.individual_scores?.[0];
            const receivedFeedback = data.feedback || data.individual_feedback?.[0];
            
            if (receivedScore === undefined || receivedFeedback === undefined) {
                 throw new Error("Received an incomplete response from the server. Data structure mismatch.");
            }

            setResults(prev => ({ 
                ...prev, 
                [currentQuestionText]: {
                    score: receivedScore, 
                    feedback: receivedFeedback,
                    text: data.transcribed_text,
                    isAnswered: true
                }
            }));

        } catch (err) {
            console.error("Audio evaluation failed:", err.response ? err.response.data : err.message);
            setError(`Evaluation failed for Q${index + 1} (Audio): ${err.response?.data?.detail || err.message}`);
        } finally {
            setLoading(false);
        }
    }, [questions, resumeFileName]); // Dependencies on context data

    // 3. Stop Recording Handler (Wrapped in useCallback)
    const stopRecording = useCallback((index, isTimeout = false) => {
        if (mediaRecorder && isRecording && currentQuestionIndex === index) {
            // Stop the stream tracks manually to release the microphone
            if (audioStreamRef.current) {
                audioStreamRef.current.getTracks().forEach(track => track.stop());
                audioStreamRef.current = null; // Clear the ref
            }

            if (isTimeout) {
                setError(`Time limit of ${AUDIO_TIME_SECONDS} seconds reached for question ${index + 1}. Submitting answer.`);
                setTimeout(() => setError(""), 3000); 
            }
            // Stop the media recorder, which triggers onstop and sendAudioForEvaluation
            mediaRecorder.stop();
            setIsRecording(false);
            setCurrentQuestionIndex(null); // Clear the active question after stopping
            setQuestionTimeLeft(AUDIO_TIME_SECONDS);
        }
    }, [mediaRecorder, isRecording, currentQuestionIndex]);

    // 2. Start Recording Handler 
    const startRecording = async (index) => {
        if (getMode(index) !== 'audio') {
            setError("Cannot start recording. Input mode is currently set to Text.");
            return;
        }
        if (isRecording || loading) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioStreamRef.current = stream; // Store the stream in the ref
            // Note: It's safer to check if the browser supports 'audio/webm;codecs=opus'
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
            const recorder = new MediaRecorder(stream, { mimeType });
            
            let chunks = [];
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunks.push(e.data);
                }
            };
            
            recorder.onstop = () => {
                // The stream stop is handled in stopRecording for reliable cleanup
                
                if (chunks.length > 0) {
                    sendAudioForEvaluation(chunks, index);
                } else {
                    // Handle case where recording stopped but no data was captured
                    setError("Recording stopped. No valid audio data captured. Please speak louder or try again.");
                    setLoading(false);
                }
            };

            setMediaRecorder(recorder);
            setCurrentQuestionIndex(index);
            setQuestionTimeLeft(AUDIO_TIME_SECONDS);
            
            recorder.start();
            setIsRecording(true);
            setError("");
            
        } catch (err) {
            console.error("Error accessing microphone:", err);
            setError("Cannot access microphone. Ensure permissions are granted. Error: " + err.message);
        }
    };

    // 1. Per-Question Timer Effect
    useEffect(() => {
        const isAudioMode = getMode(currentQuestionIndex) === 'audio';
        
        // Only run if in audio mode, a question is active, and recording
        if (isAudioMode && isRecording && currentQuestionIndex !== null && questionTimeLeft > 0) {
            const timer = setInterval(() => {
                setQuestionTimeLeft((prev) => {
                    if (prev <= 1) {
                        clearInterval(timer);
                        stopRecording(currentQuestionIndex, true); 
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);

            return () => clearInterval(timer);
        }
        // Reset timer when not recording a question in audio mode
        if ((!isRecording || !isAudioMode) && questionTimeLeft !== AUDIO_TIME_SECONDS) {
            setQuestionTimeLeft(AUDIO_TIME_SECONDS);
        }
    }, [isRecording, currentQuestionIndex, questionTimeLeft, getMode, stopRecording]); 


    // --- Handle Text Submission and Evaluation ---
    const handleTextSubmission = async (questionIndex, questionText) => {
        // This check ensures the submitted text matches the currently active question's input
        if (currentQuestionIndex !== questionIndex) {
            setError("Please ensure you are submitting the answer for the currently active text box.");
            return;
        }
        
        if (!typedAnswer.trim()) {
            setError("Please type your answer before submitting.");
            return;
        }
        
        if (isRecording) {
            setError("Please stop the active audio recording before submitting a text answer.");
            return;
        }

        setLoading(true);
        setError(""); 
        
        try {
            const payload = {
                question: questionText,
                answer: typedAnswer, 
                resume_content: resumeContentText 
            };
            
            // Call the Backend Endpoint for text evaluation
            const response = await axios.post(`${API_URL}/interview/evaluate_text`, payload);
            
            const currentQ = questionText;
            
            setResults(prev => ({ 
                ...prev, 
                [currentQ]: {
                    score: response.data.score, 
                    feedback: response.data.feedback,
                    text: typedAnswer, // The answer is the text itself
                    isAnswered: true
                }
            }));
            
            // Clear the single-source text state and reset the active index
            setTypedAnswer(''); 
            setCurrentQuestionIndex(null);
            
        } catch (err) {
            console.error("Text submission failed:", err);
            setError(`Evaluation failed for Q${questionIndex + 1} (Text): ${err.response?.data?.detail || err.message}`);
        } finally {
            setLoading(false);
        }
    };
    
    // 5. Final Evaluation Handler (Wrapped in useCallback)
    const handleFinalEvaluation = useCallback(() => {
        const answeredQuestions = Object.keys(results).length;
        
        if (answeredQuestions === 0) {
            setError("Please answer at least one question before finalizing the interview.");
            return;
        }

        const totalScoreSum = Object.values(results).reduce((sum, res) => sum + res.score, 0);
        // Calculate total score out of 100 based on answered questions (max score per question is 10)
        const finalScore = Math.round((totalScoreSum / (answeredQuestions * 10)) * 100);
        
        const overallRecommendations = [];
        const avgScore = totalScoreSum / answeredQuestions;

        // More descriptive final recommendations
        if (avgScore >= 8) {
            overallRecommendations.push("Outstanding performance! Your answers were **highly relevant, detailed, and demonstrated confidence**.");
            overallRecommendations.push("Focus on maintaining this level of detail and confidence. Try to anticipate follow-up questions.");
        } else if (avgScore >= 6.5) {
             overallRecommendations.push("Very good! Most of your answers were solid. **Improve by consistently using quantified results** and the STAR method.");
             overallRecommendations.push("Practice articulating the **impact** of your contributions more clearly in your responses.");
        } else if (avgScore >= 4) {
            overallRecommendations.push("Solid effort. Your responses were relevant but could use more depth. Focus on the **STAR method** for behavioral questions.");
            overallRecommendations.push("Review your resume's key achievements and ensure you can **link them explicitly** to the interview questions.");
        } else {
            overallRecommendations.push("Your responses were generally too brief or lacked specific evidence. **Review your resume content** and expected questions.");
            overallRecommendations.push("Focus on the core skills and prepare **specific project examples** that directly address the question.");
        }


        setFinalFeedback({
            totalScore: finalScore,
            feedback: overallRecommendations,
            // Keeping individual data for potential future use (e.g., chart visualization)
            individual_scores: Object.values(results).map(r => r.score),
            individual_feedback: Object.values(results).map(r => r.feedback),
        });
        
        // Scroll to the feedback section
        setTimeout(() => {
            document.getElementById('feedback-section')?.scrollIntoView({ behavior: 'smooth' });
        }, 100);

    }, [results]);


    if (!resumeData || !resumeData.analysisResult) {
        // This is a safety catch, as the useEffect should handle the redirect
        return <div className="p-8 text-center text-gray-500">Loading interview data...</div>;
    }


    // --- JSX Render ---
    return (
        <div className="container mx-auto p-4 md:p-8 max-w-4xl">
            
            {/* Header */}
            <h1 className="text-3xl font-bold text-gray-900 mb-6 flex items-center">
                <Zap className="w-6 h-6 mr-2 text-blue-600 fill-blue-100" /> Mock Interview Simulation
            </h1>
            <p className="text-lg text-gray-600 mb-4">
                Answer the questions by **recording your voice** or **typing your answer** below. Your response will be evaluated based on your resume context.
            </p>
            
            {/* Error Message */}
            {error && (
                <div className="p-4 mb-4 bg-red-100 text-red-700 border border-red-300 rounded-lg flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 mt-0.5" />
                    <p className="font-semibold">{error}</p>
                </div>
            )}
            
            {/* Questions Section */}
            {questions.length > 0 ? (
                <div className="mt-6">
                    <h2 className="text-xl font-semibold text-gray-800 mb-4">Questions for: <span className="text-blue-600">{resumeFileName}</span></h2>
                    
                    {questions.map((q, idx) => {
                        const result = results[q] || {}; 
                        const isAnswered = !!result.isAnswered; 
                        const mode = getMode(idx); // Get the current mode
                        const isQuestionActive = isRecording && currentQuestionIndex === idx;
                        const isTextActive = mode === 'text' && currentQuestionIndex === idx;
                        const isDisabled = loading || isAnswered || (isRecording && currentQuestionIndex !== idx);
                        // Disable toggle if a recording is currently active for this or any other question
                        const isToggleDisabled = isRecording || loading || isAnswered;

                        return (
                            <div key={idx} className={`mb-6 p-4 border rounded-xl ${
                                isAnswered ? 'bg-green-50 border-green-200 shadow-md' : 'bg-white border-gray-200'
                            } hover:shadow-lg transition-shadow`}>
                                <p className="font-bold text-gray-800 mb-2">{idx + 1}. {q}</p>
                                
                                {/* Mode Toggle Button */}
                                <div className="text-right mb-4">
                                    <button 
                                        onClick={() => toggleMode(idx)}
                                        className={`text-sm font-medium transition ${isToggleDisabled ? 'text-gray-400 cursor-not-allowed' : 'text-blue-600 hover:text-blue-800'}`}
                                        disabled={isToggleDisabled}
                                    >
                                        {mode === 'audio' ? 'Switch to Text Input' : 'Switch to Audio Recording'}
                                    </button>
                                </div>
                                
                                {/* Conditional Input Blocks */}
                                
                                {mode === 'audio' ? (
                                    /* --- AUDIO INPUT BLOCK --- */
                                    <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
                                        <button
                                            onClick={() => {
                                                if (isQuestionActive) {
                                                    stopRecording(idx);
                                                } else {
                                                    // If recording is about to start, ensure no lingering text answer is active.
                                                    setTypedAnswer(''); 
                                                    startRecording(idx);
                                                }
                                            }}
                                            disabled={isDisabled}
                                            className={`px-4 py-2 rounded-lg font-semibold transition ${
                                                isQuestionActive
                                                ? 'bg-red-600 text-white hover:bg-red-700'
                                                : 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed'
                                            } flex items-center gap-2 shadow-md`}
                                        >
                                            {isQuestionActive ? (
                                                <><Zap className="w-5 h-5 animate-pulse" /> Stop Recording</>
                                            ) : isAnswered ? (
                                                <><CheckCircle className="w-5 h-5" /> Answered</>
                                            ) : (
                                                <><Send className="w-5 h-5" /> Start Recording</>
                                            )}
                                        </button>

                                        {/* Status Display */}
                                        {(isQuestionActive || (loading && currentQuestionIndex === idx)) && (
                                            <div className="flex items-center gap-4">
                                                {/* Timer Display (Only visible when recording in audio mode) */}
                                                {isQuestionActive && (
                                                    <div className={`flex items-center font-bold text-md px-3 py-1 rounded-full border ${
                                                        questionTimeLeft <= 10 ? "text-red-600 bg-red-100 border-red-300" : "text-gray-700 bg-gray-100 border-gray-300"
                                                    }`}>
                                                        <Clock className="w-4 h-4 mr-1" /> {questionTimeLeft}s
                                                    </div>
                                                )}
                                                {loading && currentQuestionIndex === idx && (
                                                    <div className="text-gray-600 flex items-center">
                                                        <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Evaluating...
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    /* --- TEXT INPUT BLOCK (REFINEMENT APPLIED HERE) --- */
                                    <div className="flex flex-col space-y-3">
                                        <textarea
                                            rows="4"
                                            placeholder={`Type your detailed answer for Q${idx+1} here (use STAR method for behavioral questions).`}
                                            // Only display/edit typedAnswer if this is the active text box
                                            value={isTextActive ? typedAnswer : ''} 
                                            onChange={(e) => setTypedAnswer(e.target.value)}
                                            onFocus={() => {
                                                // Set this question as the active one for text input
                                                if (currentQuestionIndex !== idx) {
                                                    setCurrentQuestionIndex(idx);
                                                    setTypedAnswer(''); // Clear text when focusing a new box, to ensure a fresh start
                                                }
                                            }}
                                            className="p-3 border rounded-lg focus:ring-2 focus:ring-blue-300 disabled:bg-gray-50 resize-none"
                                            // Disable if answered, loading, recording, or not the current active text box
                                            disabled={isAnswered || loading || isRecording || (currentQuestionIndex !== null && currentQuestionIndex !== idx)}
                                        />
                                        <button 
                                            onClick={() => handleTextSubmission(idx, q)}
                                            className="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition duration-150 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                            // Disable if answered, loading, recording, or text is empty, OR if this isn't the current active text box
                                            disabled={isAnswered || loading || isRecording || !typedAnswer.trim() || currentQuestionIndex !== idx}
                                        >
                                            {loading && isTextActive ? (
                                                 <><Loader2 className="w-5 h-5 animate-spin" /> Submitting...</>
                                            ) : isAnswered ? (
                                                 <><CheckCircle className="w-5 h-5" /> Answered</>
                                            ) : (
                                                 <><MessageSquare className="w-5 h-5" /> Submit Text Answer</>
                                            )}
                                        </button>
                                    </div>
                                )}


                                {/* Transcribed/Typed Text Display */}
                                {result.text ? (
                                    <div className="mt-3 p-3 border rounded-lg bg-white border-blue-300">
                                        <p className="font-semibold text-sm text-blue-800">Your Answer ({mode === 'audio' ? 'Transcribed' : 'Typed'}):</p>
                                        <p className="text-gray-700 text-sm italic mt-1">{result.text}</p>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-500 mt-2">
                                        {mode === 'audio' ? (isQuestionActive ? "Recording your answer, you have up to 60 seconds." : "Click 'Start Recording' when ready to answer.") : "Click the text box and type your response in the box above."}
                                    </p>
                                )}
                                
                                {/* Individual Question Feedback */}
                                {isAnswered && (
                                    <div className="mt-3 p-3 bg-white border-l-4 border-green-500 rounded-r-lg">
                                        <p className={`font-bold text-base ${getScoreColor(result.score)}`}>
                                            Score: {result.score}/10
                                        </p>
                                        <p className="text-sm text-gray-700 mt-1 italic">{result.feedback}</p>
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* Submission Button (Finalize Evaluation) */}
                    <button
                        onClick={handleFinalEvaluation}
                        disabled={loading || questions.length === 0 || Object.keys(results).length === 0 || isRecording}
                        className="mt-6 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition w-full font-semibold flex items-center justify-center gap-2 shadow-xl"
                    >
                        {loading && !finalFeedback ? (
                            <><Loader2 className="w-5 h-5 animate-spin" /> Finalizing...</>
                        ) : (
                            <><Star className="w-5 h-5 fill-white text-green-300" /> Finalize Interview & Get Overall Score ({Object.keys(results).length}/{questions.length} Answered)</>
                        )}
                    </button>
                </div>
            ) : (
                <div className="p-8 text-center bg-yellow-50 border border-yellow-300 rounded-lg">
                    <p className="font-semibold text-yellow-800">No interview questions found. Please return to the ATS Analysis page.</p>
                </div>
            )}

            {/* Feedback Section (Overall Summary) */}
            {finalFeedback && (
                <div id="feedback-section" className="mt-10 p-6 border rounded-xl shadow-2xl bg-white border-green-400">
                    <h3 className="text-2xl font-bold mb-4 text-green-700 flex items-center">
                        <Star className="w-6 h-6 mr-2 fill-yellow-400 text-green-600" /> Final Interview Report
                    </h3>
                    
                    <div className="mb-4 p-4 bg-green-100 rounded-lg text-center">
                        <p className="font-bold text-lg text-green-800">
                            Total Interview Score: 
                        </p>
                        <p className="text-5xl font-extrabold text-green-900 mt-1">
                            {finalFeedback.totalScore}<span className="text-2xl font-normal">/100</span>
                        </p>
                        <p className="text-sm text-gray-600 mt-1">
                            (Based on {Object.keys(results).length} question{Object.keys(results).length !== 1 ? 's' : ''} answered)
                        </p>
                    </div>

                    <h4 className="font-semibold text-gray-800 mt-4 mb-2 border-b pb-1">Overall Recommendations:</h4>
                    <ul className="mt-2 list-disc list-inside space-y-2 text-gray-700 pl-4">
                        {finalFeedback.feedback?.map((f, i) => (
                            <li key={i} dangerouslySetInnerHTML={{ __html: f }}></li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}