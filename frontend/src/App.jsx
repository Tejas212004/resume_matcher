import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import ResultPage from "./pages/ResultPage";
import MockInterview from "./pages/MockInterview";
import { ResumeProvider } from "./context/ResumeContext"; // ✅ using your existing context

function App() {
  return (
    <ResumeProvider>
      <Router>
        <Navbar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/result" element={<ResultPage />} />
          <Route path="/mock-interview" element={<MockInterview />} />
        </Routes>
      </Router>
    </ResumeProvider>
  );
}

export default App;
