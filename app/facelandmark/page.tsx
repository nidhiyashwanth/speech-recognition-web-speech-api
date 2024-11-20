"use client";

import React, { useState, useEffect, useRef } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { useTracker } from "../context/TrackerContext";

interface CalibrationData {
  eyeLookInLeft: number[];
  eyeLookInRight: number[];
  lookLeft: number[];
  lookRight: number[];
  lookUp: number[];
  lookDown: number[];
}

const FaceLandmarkPage = () => {
  const { tracker } = useTracker();
  const [isCalibrating, setIsCalibrating] = useState(true);
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [warningCount, setWarningCount] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const [calibrationData, setCalibrationData] = useState<CalibrationData>({
    eyeLookInLeft: [],
    eyeLookInRight: [],
    lookLeft: [],
    lookRight: [],
    lookUp: [],
    lookDown: [],
  });
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>("");

  const prompts: string[] = [
    "Look into the center",
    "Now, look into the top-left corner",
    "Next, look into the top-right corner",
    "Move your gaze to the bottom-right corner",
    "Finally, look into the bottom-left corner",
    "Return your gaze to the center",
  ];

  const cuePositions: { top: string; left: string }[] = [
    { top: "50%", left: "50%" }, // Center
    { top: "10%", left: "10%" }, // Top-Left
    { top: "10%", left: "90%" }, // Top-Right
    { top: "90%", left: "90%" }, // Bottom-Right
    { top: "90%", left: "10%" }, // Bottom-Left
    { top: "50%", left: "50%" }, // Center (return)
  ];

  useEffect(() => {
    const initializeFaceLandmarker = async () => {
      const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );
      faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(
        filesetResolver,
        {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU",
          },
          outputFaceBlendshapes: true,
          runningMode: "VIDEO",
          numFaces: 1,
        }
      );
    };

    initializeFaceLandmarker();

    // Set up video
    if (videoRef.current) {
      videoRef.current.onloadedmetadata = () => {
        setIsVideoReady(true);
      };
      navigator.mediaDevices
        .getUserMedia({ video: true })
        .then((stream) => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play();
          }
        })
        .catch((err) => {
          console.error("Error accessing the camera:", err);
        });
    }

    return () => {
      // Clean up video stream
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (isVideoReady && isCalibrating) {
      const animationTimer = setTimeout(() => {
        if (currentPromptIndex < prompts.length - 1) {
          setCurrentPromptIndex((prevIndex) => prevIndex + 1);
          if (currentPromptIndex > 0 && currentPromptIndex < 5) {
            captureCalibrationData();
          }
        } else {
          setIsCalibrating(false);
          saveCalibrationData();
        }
      }, 3000);

      return () => clearTimeout(animationTimer);
    }
  }, [currentPromptIndex, isCalibrating, isVideoReady]);

  useEffect(() => {
    if (isVideoReady && !isCalibrating) {
      const detectionInterval = setInterval(detectFaceLandmarks, 100);
      return () => clearInterval(detectionInterval);
    }
  }, [isCalibrating, isVideoReady]);

  const captureCalibrationData = () => {
    if (videoRef.current && faceLandmarkerRef.current) {
      const results = faceLandmarkerRef.current.detectForVideo(
        videoRef.current,
        Date.now()
      );
      if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
        const blendshapes = results.faceBlendshapes[0].categories;
        const getBlendshapeScore = (name: string) =>
          blendshapes.find((b: any) => b.categoryName === name)?.score || 0;

        setCalibrationData((prevData) => ({
          eyeLookInLeft: [
            ...prevData.eyeLookInLeft,
            getBlendshapeScore("eyeLookInLeft"),
          ],
          eyeLookInRight: [
            ...prevData.eyeLookInRight,
            getBlendshapeScore("eyeLookInRight"),
          ],
          lookLeft: [...prevData.lookLeft, getBlendshapeScore("lookLeft")],
          lookRight: [...prevData.lookRight, getBlendshapeScore("lookRight")],
          lookUp: [...prevData.lookUp, getBlendshapeScore("lookUp")],
          lookDown: [...prevData.lookDown, getBlendshapeScore("lookDown")],
        }));
      }
    }
  };

  const saveCalibrationData = () => {
    const calculateAverage = (arr: number[]) =>
      arr.reduce((a, b) => a + b, 0) / arr.length;
    const minThreshold = 0.05;

    const averagedData = {
      eyeLookInLeft: Math.max(
        calculateAverage(calibrationData.eyeLookInLeft),
        minThreshold
      ),
      eyeLookInRight: Math.max(
        calculateAverage(calibrationData.eyeLookInRight),
        minThreshold
      ),
      lookLeft: Math.max(
        calculateAverage(calibrationData.lookLeft),
        minThreshold
      ),
      lookRight: Math.max(
        calculateAverage(calibrationData.lookRight),
        minThreshold
      ),
      lookUp: Math.max(calculateAverage(calibrationData.lookUp), minThreshold),
      lookDown: Math.max(
        calculateAverage(calibrationData.lookDown),
        minThreshold
      ),
    };

    sessionStorage.setItem("calibrationData", JSON.stringify(averagedData));
  };

  const detectFaceLandmarks = () => {
    if (videoRef.current && faceLandmarkerRef.current && canvasRef.current) {
      const results = faceLandmarkerRef.current.detectForVideo(
        videoRef.current,
        Date.now()
      );
      if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
        const blendshapes = results.faceBlendshapes[0].categories;
        const getBlendshapeScore = (name: string) =>
          blendshapes.find((b: any) => b.categoryName === name)?.score || 0;

        const calibratedData = JSON.parse(
          sessionStorage.getItem("calibrationData") || "{}"
        );

        const warningThreshold = 1.5; // Adjust this value as needed
        const isWarning =
          Math.abs(
            getBlendshapeScore("eyeLookInLeft") - calibratedData.eyeLookInLeft
          ) >
            warningThreshold * calibratedData.eyeLookInLeft ||
          Math.abs(
            getBlendshapeScore("eyeLookInRight") - calibratedData.eyeLookInRight
          ) >
            warningThreshold * calibratedData.eyeLookInRight ||
          Math.abs(getBlendshapeScore("lookLeft") - calibratedData.lookLeft) >
            warningThreshold * calibratedData.lookLeft ||
          Math.abs(getBlendshapeScore("lookRight") - calibratedData.lookRight) >
            warningThreshold * calibratedData.lookRight ||
          Math.abs(getBlendshapeScore("lookUp") - calibratedData.lookUp) >
            warningThreshold * calibratedData.lookUp ||
          Math.abs(getBlendshapeScore("lookDown") - calibratedData.lookDown) >
            warningThreshold * calibratedData.lookDown;

        if (isWarning) {
          setWarningCount((prevCount) => prevCount + 1);
        }

        // Update debug info
        setDebugInfo(`
          eyeLookInLeft: ${getBlendshapeScore("eyeLookInLeft").toFixed(
            3
          )} / ${calibratedData.eyeLookInLeft.toFixed(3)}
          eyeLookInRight: ${getBlendshapeScore("eyeLookInRight").toFixed(
            3
          )} / ${calibratedData.eyeLookInRight.toFixed(3)}
          lookLeft: ${getBlendshapeScore("lookLeft").toFixed(
            3
          )} / ${calibratedData.lookLeft.toFixed(3)}
          lookRight: ${getBlendshapeScore("lookRight").toFixed(
            3
          )} / ${calibratedData.lookRight.toFixed(3)}
          lookUp: ${getBlendshapeScore("lookUp").toFixed(
            3
          )} / ${calibratedData.lookUp.toFixed(3)}
          lookDown: ${getBlendshapeScore("lookDown").toFixed(
            3
          )} / ${calibratedData.lookDown.toFixed(3)}
        `);

        // Draw face landmark
        if (results.faceLandmarks && results.faceLandmarks.length > 0) {
          const landmarks = results.faceLandmarks[0];
          const ctx = canvasRef.current.getContext("2d");
          if (ctx) {
            ctx.clearRect(
              0,
              0,
              canvasRef.current.width,
              canvasRef.current.height
            );
            ctx.fillStyle = isWarning ? "red" : "green";
            ctx.beginPath();
            ctx.arc(
              landmarks[0].x * canvasRef.current.width,
              landmarks[0].y * canvasRef.current.height,
              5,
              0,
              2 * Math.PI
            );
            ctx.fill();
          }
        }
      }
    }
  };

  return (
    <div className="relative h-screen w-screen">
      <video ref={videoRef} className="h-[25%] w-[25%] object-cover" />
      <canvas ref={canvasRef} className="absolute inset-0" />
      {isCalibrating && isVideoReady && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div
            className="absolute h-[50px] w-[50px] translate-x-[-50%] translate-y-[-50%] rounded-full border-[10px] border-white"
            style={{
              top: cuePositions[currentPromptIndex].top,
              left: cuePositions[currentPromptIndex].left,
            }}
          />
          <p className="text-2xl font-bold text-white">
            {prompts[currentPromptIndex]}
          </p>
        </div>
      )}
      {!isCalibrating && isVideoReady && (
        <div className="absolute bottom-4 left-4 text-xl font-bold text-white">
          Warnings: {warningCount}
        </div>
      )}
      <div className="absolute top-4 left-4 text-xl font-bold text-white whitespace-pre-line">
        {debugInfo}
      </div>
    </div>
  );
};

export default FaceLandmarkPage;
