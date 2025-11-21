import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useResume } from "../context/ResumeContext"; 
import { 
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from "recharts";
import { FileText, Zap, Lightbulb, TrendingUp, User, Mail, Phone, BookOpen, Star, Loader2 } from 'lucide-react';

const COLORS = ["#4F46E5", "#CBD5E1"];

const SectionTitle = ({ icon: Icon, title }) => (
  <h3 className="flex items-center text-xl font-semibold text-gray-800 dark:text-white mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">
    <Icon className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" />
    {title}
  </h3>
);

const ScoreRing = ({ score, label }) => {
    const radius = 50;
    const circumference = 2 * Math.PI * radius;
    const safeScore = isNaN(score) ? 0 : score;
    const offset = circumference - (safeScore / 100) * circumference;

    const getScoreColor = (s) => {
        if (s >= 80) return "text-green-600 dark:text-green-400";
        if (s >= 50) return "text-yellow-600 dark:text-yellow-400";
        return "text-red-600 dark:text-red-400";
    };

    return (
        <div className="flex flex-col items-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl shadow-inner">
            <div className="relative w-[120px] h-[120px]">
                <svg className="w-full h-full transform -rotate-90">
                    <circle className="text-gray-200 dark:text-gray-600" strokeWidth="10" stroke="currentColor" fill="transparent" r={radius} cx="60" cy="60" />
                    <circle 
                        className={`transition-all duration-1000 ${getScoreColor(safeScore)}`} 
                        strokeWidth="10" 
                        strokeDasharray={circumference} 
                        strokeDashoffset={offset} 
                        strokeLinecap="round" 
                        stroke="currentColor" 
                        fill="transparent" 
                        r={radius} cx="60" cy="60" 
                    />
                </svg>
                <span className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 font-bold text-3xl ${getScoreColor(safeScore)}`}>
                    {safeScore}%
                </span>
            </div>
            <p className="mt-2 text-sm font-medium text-gray-700 dark:text-gray-200">{label}</p>
        </div>
    );
};

export default function ResultPage() {
  const { resumeData } = useResume();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('analysis');

  // --- 1. SAFE DATA EXTRACTION ---
  // We default everything to empty arrays/objects to prevent crashes
  const match = resumeData?.matchResult || {};
  const analysis = resumeData?.analysisResult || {};
  
  const jdSkills = match.jd_skills || [];
  const matchedSkills = match.matched_skills || [];
  const matchScore = match.match_score || 0;

  // Check if analysis is complete
  if (!resumeData?.analysisComplete) {
    return (
      <div className="flex flex-col items-center justify-center h-screen pt-20 dark:text-white">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
        <h2 className="text-2xl font-semibold text-gray-600 dark:text-gray-300">No results found. Please upload your files.</h2>
        <button
          onClick={() => navigate("/")}
          className="mt-6 bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 transition shadow-lg"
        >
          Go to Upload Page
        </button>
      </div>
    );
  }

  // --- 2. MEMOIZED CHART DATA ---
  const pieData = useMemo(() => {
    if (jdSkills.length === 0) return [];
    
    const matchedCount = matchedSkills.length;
    const unmatchedCount = Math.max(0, jdSkills.length - matchedCount);
    
    return [
      { name: "Matched", value: matchedCount },
      { name: "Unmatched", value: unmatchedCount },
    ];
  }, [jdSkills, matchedSkills]);
  
  const radarData = analysis.radar_data || [];

  // --- 3. TAB RENDERERS ---
  const renderAnalysisTab = () => (
    <div className="space-y-8">
      <div className="grid md:grid-cols-3 gap-6 items-center border-b border-gray-200 dark:border-gray-700 pb-6 mb-6">
        <ScoreRing score={Math.round(analysis.ats_score || 0)} label="ATS Score" />
        
        <div className="md:col-span-2 space-y-3 p-4 border border-gray-200 dark:border-gray-700 rounded-xl bg-indigo-50/50 dark:bg-indigo-900/20 shadow-sm">
            <div className="flex items-center text-lg font-bold text-gray-800 dark:text-white">
                <User className="w-5 h-5 mr-2 text-indigo-600 dark:text-indigo-400" />
                {analysis.name || "Candidate Name"}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300">
                <Mail className="inline w-4 h-4 mr-1" /> {analysis.email || "Email Not Found"}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-300">
                <Phone className="inline w-4 h-4 mr-1" /> {analysis.phone || "Phone Not Found"}
            </p>
            <p className="text-base font-semibold text-purple-700 dark:text-purple-400 mt-2 flex items-center">
                <Star className="w-5 h-5 mr-2 text-purple-600 fill-purple-200 dark:fill-purple-900" />
                Recommended: {analysis.recommended_job || "N/A"} 
                <span className="ml-4 text-xs font-normal text-gray-500 dark:text-gray-400">
                    (Category: {analysis.predicted_category || "Unknown"})
                </span>
            </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div>
            <SectionTitle icon={Lightbulb} title="Personalized Tips" />
            <ul className="list-disc list-inside space-y-3 text-gray-700 dark:text-gray-300 pl-4">
                {analysis.personalized_tips?.length > 0 ? (
                    analysis.personalized_tips.map((tip, i) => <li key={i} className="text-sm">{tip}</li>)
                ) : (
                    <p className="text-gray-500 italic text-sm">No specific tips generated.</p>
                )}
            </ul>
        </div>

        <div>
            <SectionTitle icon={TrendingUp} title="Skill Gap & Growth" />
            <h4 className="font-medium text-red-600 dark:text-red-400 mb-2">Missing Skills:</h4>
            <div className="flex flex-wrap gap-2 mb-4">
                {analysis.missing_skills?.length > 0 ? (
                    analysis.missing_skills.map((skill, i) => (
                        <span key={i} className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2 py-1 rounded-md text-sm">{skill}</span>
                    ))
                ) : (
                    <p className="text-gray-500 italic text-sm">No significant skill gaps detected.</p>
                )}
            </div>
            
            <h4 className="font-medium text-green-600 dark:text-green-400 mb-2 mt-4">Future Skills to Learn:</h4>
            <div className="flex flex-wrap gap-2">
                {analysis.future_skills?.length > 0 ? (
                    analysis.future_skills.map((skill, i) => (
                        <span key={i} className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-1 rounded-md text-sm">{skill}</span>
                    ))
                ) : (
                    <p className="text-gray-500 italic text-sm">No future skills suggested.</p>
                )}
            </div>
        </div>
      </div>
      
      {radarData.length > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6">
            <SectionTitle icon={Zap} title="Skills Analysis Radar" />
            <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <RadarChart outerRadius={90} data={radarData}>
                        <PolarGrid stroke="#9CA3AF" />
                        <PolarAngleAxis dataKey="skill" stroke="#6B7280" tick={{ fill: '#6B7280' }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#9CA3AF" />
                        <Radar name="Score" dataKey="score" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
                        <RechartsTooltip contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' }} />
                    </RadarChart>
                </ResponsiveContainer>
            </div>
        </div>
      )}

      <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6">
        <SectionTitle icon={BookOpen} title="Extracted Education & Skills" />
        <div className="grid md:grid-cols-2 gap-6">
            <div>
                <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Education:</h4>
                <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-400 pl-4 space-y-1">
                    {analysis.extracted_education?.length > 0 ? (
                        analysis.extracted_education.map((edu, i) => <li key={i}>{edu}</li>)
                    ) : (
                        <p className="text-gray-500 italic text-sm">No education details extracted.</p>
                    )}
                </ul>
            </div>
            <div>
                <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">All Extracted Skills:</h4>
                <div className="flex flex-wrap gap-2">
                    {analysis.extracted_skills?.length > 0 ? (
                        analysis.extracted_skills.map((skill, i) => (
                            <span key={i} className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-md text-xs font-medium">{skill}</span>
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
      <div className="flex flex-col md:flex-row items-center justify-center gap-8 border-b border-gray-200 dark:border-gray-700 pb-6">
        <div className="w-full md:w-1/2 flex flex-col items-center">
            <ScoreRing score={Math.round(matchScore)} label="JD Match Score" />
        </div>

        <div className="text-center md:text-left md:w-1/2">
          <SectionTitle icon={FileText} title="Match Summary" />
          <p className="text-lg font-medium mb-4 text-gray-800 dark:text-gray-200">
            Total JD Skills: <span className="text-gray-700 dark:text-gray-300 font-bold">{jdSkills.length}</span>
          </p>
          <p className="text-lg font-medium mb-4 text-gray-800 dark:text-gray-200">
            Matched Skills: <span className="text-purple-700 dark:text-purple-400 font-bold">{matchedSkills.length}</span>
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div>
          <SectionTitle icon={Zap} title="Matched Skills (Resume 🤝 JD)" />
          <div className="flex flex-wrap gap-2">
            {matchedSkills.length > 0 ? (
              matchedSkills.map((skill, i) => (
                <span key={i} className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-1 rounded-md text-sm">
                  {skill}
                </span>
              ))
            ) : (
              <p className="text-gray-500 text-sm italic">No semantic matches found.</p>
            )}
          </div>
        </div>

        <div>
          <SectionTitle icon={FileText} title="All JD Skills" />
          <div className="flex flex-wrap gap-2">
            {jdSkills.length > 0 ? (
              jdSkills.map((skill, i) => (
                <span key={i} className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-1 rounded-md text-sm">
                  {skill}
                </span>
              ))
            ) : (
              <p className="text-gray-500 text-sm italic">No JD skills extracted.</p>
            )}
          </div>
        </div>
      </div>
      
      {/* 🛑 FIX: Pie Chart Safe Rendering */}
      {pieData.length > 0 && jdSkills.length > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6">
            <SectionTitle icon={Zap} title="Match Visualization" />
            <div className="h-[300px] w-full"> {/* Dedicated Container */}
                <ResponsiveContainer width="100%" height="100%">
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
                      <RechartsTooltip contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' }} />
                      <Legend />
                    </PieChart>
                </ResponsiveContainer>
            </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen pt-20 flex flex-col items-center p-6">
      <div className="bg-white dark:bg-gray-800 shadow-2xl rounded-2xl p-8 w-full max-w-4xl border border-gray-100 dark:border-gray-700 transition-colors duration-300">
        <h2 className="text-3xl font-extrabold text-center mb-6 text-gray-900 dark:text-white">
          Comprehensive Analysis for: <span className="text-blue-600 dark:text-blue-400">{resumeData.resume || "Your Resume"}</span>
        </h2>

        <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
          <button
            onClick={() => setActiveTab('analysis')}
            className={`px-6 py-3 text-lg font-medium transition-colors ${
              activeTab === 'analysis' 
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400' 
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            ATS Analysis
          </button>
          <button
            onClick={() => setActiveTab('match')}
            className={`px-6 py-3 text-lg font-medium transition-colors ${
              activeTab === 'match' 
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400' 
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            JD Match ({Math.round(matchScore)}%)
          </button>
        </div>

        <div>
          {activeTab === 'analysis' && renderAnalysisTab()}
          {activeTab === 'match' && renderMatchTab()}
        </div>

        <div className="mt-10 flex flex-col md:flex-row justify-center gap-4 border-t border-gray-200 dark:border-gray-700 pt-6">
          <button
            onClick={() => navigate("/")}
            className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 py-2 px-6 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition font-medium"
          >
            Start New Analysis
          </button>

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