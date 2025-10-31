import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useResume } from "../context/ResumeContext"; // ✅ Import context
import { 
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from "recharts";
import { FileText, Zap, Lightbulb, TrendingUp, User, Mail, Phone, BookOpen, Star, Loader2 } from 'lucide-react';

// --- Recharts Data Components ---
const COLORS = ["#4F46E5", "#CBD5E1"];

// --- Utility Components ---
const SectionTitle = ({ icon: Icon, title }) => (
  <h3 className="flex items-center text-xl font-semibold text-gray-800 mb-4 border-b pb-2">
    <Icon className="w-5 h-5 mr-2 text-blue-600" />
    {title}
  </h3>
);

// --- Score Visualization ---
const ScoreRing = ({ score, label }) => {
    const radius = 50;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;

    const getScoreColor = (s) => {
        if (s >= 80) return "text-green-600 border-green-600";
        if (s >= 50) return "text-yellow-600 border-yellow-600";
        return "text-red-600 border-red-600";
    };

    return (
        <div className="flex flex-col items-center p-4 bg-gray-50 rounded-xl shadow-inner">
            <div className="relative w-[120px] h-[120px]">
                <svg className="w-full h-full transform -rotate-90">
                    <circle
                        className="text-gray-200"
                        strokeWidth="10"
                        stroke="currentColor"
                        fill="transparent"
                        r={radius}
                        cx="60"
                        cy="60"
                    />
                    <circle
                        className={`transition-all duration-1000 ${getScoreColor(score).split(' ')[1]}`}
                        strokeWidth="10"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="transparent"
                        r={radius}
                        cx="60"
                        cy="60"
                    />
                </svg>
                <span className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 font-bold text-3xl ${getScoreColor(score).split(' ')[0]}`}>
                    {score}%
                </span>
            </div>
            <p className="mt-2 text-sm font-medium text-gray-700">{label}</p>
        </div>
    );
};


// --- Main Component ---
export default function ResultPage() {
  const { resumeData } = useResume();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('analysis');

  // Destructure data from context
  const { matchResult, analysisResult, analysisComplete, resume, jd } = resumeData;
  const match = matchResult || {};
  const analysis = analysisResult || {};

  // Check if analysis is complete (if user navigates directly without analysis)
  if (!analysisComplete) {
    return (
      <div className="flex flex-col items-center justify-center h-screen pt-20">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
        <h2 className="text-2xl font-semibold text-gray-600">No results found. Please upload your files.</h2>
        <button
          onClick={() => navigate("/")}
          className="mt-6 bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 transition shadow-lg"
        >
          Go to Upload Page
        </button>
      </div>
    );
  }

  // Memoized data for JD Match Pie Chart
  const pieData = useMemo(() => {
    if (!match.jd_skills?.length) {
        return [{ name: "No JD Provided", value: 1 }];
    }
    const unmatchedCount = Math.max(0, match.jd_skills.length - match.matched_skills.length);
    return [
      { name: "Matched Skills", value: match.matched_skills.length },
      { name: "Unmatched Skills", value: unmatchedCount },
    ];
  }, [match]);
  
  // Memoized data for Skills Radar Chart
  const radarData = analysis.radar_data || [];


  // --- Render Functions for Tabs ---
  const renderAnalysisTab = () => (
    <div className="space-y-8">
      
      {/* 1. Score and Core Info */}
      <div className="grid md:grid-cols-3 gap-6 items-center border-b pb-6 mb-6">
        <ScoreRing score={Math.round(analysis.ats_score || 0)} label="ATS Score (out of 100)" />
        
        <div className="md:col-span-2 space-y-3 p-4 border rounded-xl bg-indigo-50/50 shadow-sm">
            <div className="flex items-center text-lg font-bold text-gray-800">
                <User className="w-5 h-5 mr-2 text-indigo-600" />
                {analysis.name || "Candidate Name"}
            </div>
            <p className="text-sm">
                <Mail className="inline w-4 h-4 mr-1 text-gray-500" /> {analysis.email || "Email Not Found"}
            </p>
            <p className="text-sm">
                <Phone className="inline w-4 h-4 mr-1 text-gray-500" /> {analysis.phone || "Phone Not Found"}
            </p>
            <p className="text-base font-semibold text-purple-700 mt-2 flex items-center">
                <Star className="w-5 h-5 mr-2 text-purple-600 fill-purple-200" />
                Recommended Job: {analysis.recommended_job || "N/A"} 
                <span className="ml-4 text-xs font-normal text-gray-500">
                    (Category: {analysis.predicted_category || "Unknown"})
                </span>
            </p>
        </div>
      </div>

      {/* 2. Skills and Tips Section */}
      <div className="grid md:grid-cols-2 gap-8">
        
        {/* Personalized Tips */}
        <div>
            <SectionTitle icon={Lightbulb} title="Personalized Tips" />
            <ul className="list-disc list-inside space-y-3 text-gray-700 pl-4">
                {analysis.personalized_tips?.length > 0 ? (
                    analysis.personalized_tips.map((tip, i) => <li key={i} className="text-sm">{tip}</li>)
                ) : (
                    <p className="text-gray-500 italic text-sm">No specific tips generated.</p>
                )}
            </ul>
        </div>

        {/* Missing & Future Skills */}
        <div>
            <SectionTitle icon={TrendingUp} title="Skill Gap & Growth" />
            <h4 className="font-medium text-red-600 mb-2">Missing Skills:</h4>
            <div className="flex flex-wrap gap-2 mb-4">
                {analysis.missing_skills?.length > 0 ? (
                    analysis.missing_skills.map((skill, i) => (
                        <span key={i} className="bg-red-100 text-red-700 px-2 py-1 rounded-md text-sm">{skill}</span>
                    ))
                ) : (
                    <p className="text-gray-500 italic text-sm">No significant skill gaps detected for the recommended job.</p>
                )}
            </div>
            
            <h4 className="font-medium text-green-600 mb-2 mt-4">Future Skills to Learn:</h4>
            <div className="flex flex-wrap gap-2">
                {analysis.future_skills?.length > 0 ? (
                    analysis.future_skills.map((skill, i) => (
                        <span key={i} className="bg-green-100 text-green-700 px-2 py-1 rounded-md text-sm">{skill}</span>
                    ))
                ) : (
                    <p className="text-gray-500 italic text-sm">No future skills suggested.</p>
                )}
            </div>
        </div>
      </div>
      
      {/* 3. Skills Radar Chart (if data exists) */}
      {radarData.length > 0 && (
        <div className="border-t pt-6 mt-6">
            <SectionTitle icon={Zap} title="Skills Analysis Radar" />
            <p className="text-sm text-gray-600 mb-4">
                (Scores based on resume context, job recommendation, and skill gap)
            </p>
            <ResponsiveContainer width="100%" height={300}>
                <RadarChart outerRadius={90} width={730} height={250} data={radarData}>
                    <PolarGrid stroke="#e5e7eb" />
                    <PolarAngleAxis dataKey="skill" stroke="#4b5563" />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#e5e7eb" />
                    <Radar name="Score" dataKey="score" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
                    <Tooltip />
                </RadarChart>
            </ResponsiveContainer>
        </div>
      )}

      {/* 4. Extracted Details */}
      <div className="border-t pt-6 mt-6">
        <SectionTitle icon={BookOpen} title="Extracted Education & Skills" />
        <div className="grid md:grid-cols-2 gap-6">
            <div>
                <h4 className="font-medium text-gray-700 mb-2">Education:</h4>
                <ul className="list-disc list-inside text-sm text-gray-600 pl-4 space-y-1">
                    {analysis.extracted_education?.length > 0 ? (
                        analysis.extracted_education.map((edu, i) => <li key={i}>{edu}</li>)
                    ) : (
                        <p className="text-gray-500 italic text-sm">No education details extracted.</p>
                    )}
                </ul>
            </div>
            <div>
                <h4 className="font-medium text-gray-700 mb-2">All Extracted Skills:</h4>
                <div className="flex flex-wrap gap-2">
                    {analysis.extracted_skills?.length > 0 ? (
                        analysis.extracted_skills.map((skill, i) => (
                            <span key={i} className="bg-blue-100 text-blue-700 px-2 py-1 rounded-md text-xs font-medium">{skill}</span>
                        ))
                    ) : (
                        <p className="text-gray-500 italic text-sm">No skills extracted.</p>
                    )}
                </div>
            </div>
        </div>
      </div>
    </div>
  );

  const renderMatchTab = () => (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row items-center justify-center gap-8 border-b pb-6">
        <div className="w-full md:w-1/2 flex flex-col items-center">
            <ScoreRing score={match.match_score || 0} label="JD Match Score (out of 100)" />
        </div>

        <div className="text-center md:text-left md:w-1/2">
          <SectionTitle icon={FileText} title="Match Summary" />
          <p className="text-lg font-medium mb-4">
            Total JD Skills: <span className="text-gray-700 font-bold">{match.jd_skills?.length || 0}</span>
          </p>
          <p className="text-lg font-medium mb-4">
            Matched Skills: <span className="text-purple-700 font-bold">{match.matched_skills?.length || 0}</span>
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* JD Match Skills */}
        <div>
          <SectionTitle icon={Zap} title="Matched Skills (Resume 🤝 JD)" />
          <div className="flex flex-wrap gap-2">
            {match.matched_skills?.length > 0 ? (
              match.matched_skills.map((skill, i) => (
                <span
                  key={i}
                  className="bg-purple-100 text-purple-700 px-2 py-1 rounded-md text-sm"
                >
                  {skill}
                </span>
              ))
            ) : (
              <p className="text-gray-500 text-sm italic">No semantic matches found.</p>
            )}
          </div>
        </div>

        {/* Unmatched JD Skills */}
        <div>
          <SectionTitle icon={FileText} title="All JD Skills" />
          <div className="flex flex-wrap gap-2">
            {match.jd_skills?.length > 0 ? (
              match.jd_skills.map((skill, i) => (
                <span
                  key={i}
                  className="bg-green-100 text-green-700 px-2 py-1 rounded-md text-sm"
                >
                  {skill}
                </span>
              ))
            ) : (
              <p className="text-gray-500 text-sm italic">No JD skills were extracted. JD not uploaded or empty.</p>
            )}
          </div>
        </div>
      </div>
      
      {/* Pie Chart */}
      {pieData.length === 2 && match.jd_skills?.length > 0 && (
        <div className="border-t pt-6 mt-6">
            <SectionTitle icon={Zap} title="Match Visualization" />
            <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={pieData}
                    innerRadius={70}
                    outerRadius={100}
                    dataKey="value"
                    paddingAngle={3}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
            </ResponsiveContainer>
        </div>
      )}
    </div>
  );


  return (
    <div className="min-h-screen pt-20 flex flex-col items-center p-6">
      <div className="bg-white shadow-2xl rounded-2xl p-8 w-full max-w-4xl border border-gray-100">
        <h2 className="text-3xl font-extrabold text-center mb-6 text-gray-900">
          Comprehensive Analysis for: <span className="text-blue-600">{resume || "Your Resume"}</span>
        </h2>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200 mb-6">
          <button
            onClick={() => setActiveTab('analysis')}
            className={`px-6 py-3 text-lg font-medium transition-colors ${
              activeTab === 'analysis' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            ATS Analysis
          </button>
          <button
            onClick={() => setActiveTab('match')}
            className={`px-6 py-3 text-lg font-medium transition-colors ${
              activeTab === 'match' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            JD Match ({match.match_score || 0}%)
          </button>
        </div>

        {/* Tab Content */}
        <div>
          {activeTab === 'analysis' && renderAnalysisTab()}
          {activeTab === 'match' && renderMatchTab()}
        </div>

        {/* Buttons Section */}
        <div className="mt-10 flex flex-col md:flex-row justify-center gap-4 border-t pt-6">
          <button
            onClick={() => navigate("/")}
            className="bg-gray-200 text-gray-700 py-2 px-6 rounded-lg hover:bg-gray-300 transition font-medium"
          >
            Start New Analysis
          </button>

          {/* Start Mock Interview Button */}
          <button
            onClick={() => navigate("/mock-interview")}
            className="bg-green-600 text-white py-2 px-6 rounded-lg hover:bg-green-700 transition shadow-lg font-medium flex items-center justify-center gap-2"
          >
            <Zap className="w-5 h-5" /> Start Mock Interview
          </button>
        </div>
      </div>
    </div>
  );
}