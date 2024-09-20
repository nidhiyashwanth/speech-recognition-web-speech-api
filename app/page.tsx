// @ts-nocheck
"use client";

import Image from "next/image";
import { useState } from "react";

export default function Home() {
  const [isTalking, setIsTalking] = useState(false);
  const [calibrationData, setCalibrationData] = useState([]);
  const handleProctoring = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Placeholder: Here you would integrate Mediapipe's audio model to process the stream
    console.log("Proctoring audio stream started.");

    // Simulate continuous voice detection
    setIsTalking(true);

    // Stop the stream when done
    stream.getTracks().forEach((track) => track.stop());
  };

  const handleCalibration = async () => {
    // Request audio input from the user's microphone
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Placeholder: Here you would integrate Mediapipe's audio model to process the stream
    console.log("Audio stream started for calibration.");

    // After processing, store the calibration data (like voice confidence)
    // In a real app, this would come from the Mediapipe model's output
    setCalibrationData([...calibrationData, { score: Math.random() * 100 }]);

    // Stop the stream after calibration is done
    stream.getTracks().forEach((track) => track.stop());
  };

  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <h1>Audio Classifier Demo</h1>

      <div>
        <h1>Proctoring</h1>
        <button onClick={handleProctoring}>Start Proctoring</button>
        {isTalking && <p>Student is talking. Monitoring...</p>}
      </div>

      <h1>Calibration</h1>
      <p>Please speak the following sentence:</p>
      <p>"The quick brown fox jumps over the lazy dog."</p>
      <button onClick={handleCalibration}>Start Calibration</button>
      <div>
        <h2>Calibration Data:</h2>
        <ul>
          {calibrationData.map((data, index) => (
            <li key={index}>Voice confidence score: {data.score.toFixed(2)}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
