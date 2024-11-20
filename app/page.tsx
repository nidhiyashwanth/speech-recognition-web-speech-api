// @ts-nocheck
"use client";

import { useEffect, useState, useRef } from "react";
import { UserActivityTracker } from "@/app/utils/tracker";

export default function Home() {
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [threshold, setThreshold] = useState(0);
  const [warning, setWarning] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlobs, setAudioBlobs] = useState<Blob[]>([]);
  const [audioUrls, setAudioUrls] = useState<string[]>([]);

  const [calibrationTranscript, setCalibrationTranscript] = useState("");
  const [calibrationComplete, setCalibrationComplete] = useState(false);
  const [matchedWords, setMatchedWords] = useState<Set<string>>(new Set());
  const [timeLeft, setTimeLeft] = useState(20);

  const [screenCapture, setScreenCapture] = useState<string | null>(null);
  const [hasScreenPermission, setHasScreenPermission] = useState(false);
  const [screenCaptureTrack, setScreenCaptureTrack] =
    useState<MediaStreamTrack | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);

  const readingPrompt = `this sentence is to test your microphone and to calibrate your device for the best possible experience`;

  const requiredWords = readingPrompt
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 3);

  useEffect(() => {
    console.log("Setting up event listeners");

    const handleVisibilityChange = async () => {
      console.log("Visibility changed. Hidden:", document.hidden);
      console.log("Has screen permission:", hasScreenPermission);
      console.log("Is listening:", isListening);
      if (document.hidden && hasScreenPermission && isListening) {
        console.log("Attempting to capture screen on visibility change");
        await captureScreen();
      }
    };

    const windowOnBlur = async () => {
      console.log("Window blurred");
      console.log("Has screen permission:", hasScreenPermission);
      console.log("Is listening:", isListening);
      if (hasScreenPermission && isListening) {
        console.log("Attempting to capture screen on blur");
        await captureScreen();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", windowOnBlur);

    return () => {
      console.log("Cleaning up event listeners");
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", windowOnBlur);
      if (screenCaptureTrack) {
        screenCaptureTrack.stop();
      }
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioContextRef.current) audioContextRef.current.close();

      // Ensure microphone is released
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      // Stop any ongoing getUserMedia streams
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          stream.getTracks().forEach((track) => track.stop());
        })
        .catch((err) => console.error("Error accessing media devices.", err));
    };
  }, [hasScreenPermission, isListening, screenCaptureTrack]);

  useEffect(() => {
    const handleFullScreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullScreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullScreenChange);
    };
  }, []);

  const enterFullScreen = () => {
    const element = document.documentElement;
    if (element.requestFullscreen) {
      element.requestFullscreen();
    } else if (element.mozRequestFullScreen) {
      // Firefox
      element.mozRequestFullScreen();
    } else if (element.webkitRequestFullscreen) {
      // Chrome, Safari and Opera
      element.webkitRequestFullscreen();
    } else if (element.msRequestFullscreen) {
      // IE/Edge
      element.msRequestFullscreen();
    }
    setIsFullScreen(true);
  };

  const requestScreenPermission = async () => {
    try {
      console.log("Requesting screen permission...");
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "monitor", // This requests the entire screen
        },
        audio: false,
      });

      // Check if the user has shared the entire screen
      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings();

      if (settings.displaySurface !== "monitor") {
        console.log("User did not share the entire screen");
        stream.getTracks().forEach((track) => track.stop());
        alert("Please share your entire screen, not just a window or tab.");
        setHasScreenPermission(false);
        setScreenCaptureTrack(null);
        return;
      }

      // Stop any existing tracks
      if (screenCaptureTrack) {
        screenCaptureTrack.stop();
      }

      setScreenCaptureTrack(track);
      setHasScreenPermission(true);
      console.log("Screen permission granted for entire screen");

      // Set up a listener for when the user stops sharing the screen
      track.onended = () => {
        console.log("User stopped sharing screen");
        setHasScreenPermission(false);
        setScreenCaptureTrack(null);
      };

      await enterFullScreen();
    } catch (error) {
      console.error("Error requesting screen capture permission:", error);
      setHasScreenPermission(false);
      setScreenCapture(null);
    }
  };

  const captureScreen = async () => {
    console.log("captureScreen function called");
    if (!screenCaptureTrack) {
      console.log("No screen capture track available");
      await requestScreenPermission();
      return;
    }

    // Add a delay before capturing the screen
    await new Promise((resolve) => setTimeout(resolve, 100)); // 500ms delay

    try {
      if (screenCaptureTrack.readyState === "ended") {
        console.log(
          "Screen capture track has ended. Requesting new permission."
        );
        await requestScreenPermission();
        return;
      }

      const imageCapture = new ImageCapture(screenCaptureTrack);
      const bitmap = await imageCapture.grabFrame();
      console.log("Grabbed frame:", bitmap);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      context?.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height);
      const screenCaptureUrl = canvas.toDataURL("image/jpeg", 0.8);
      setScreenCapture(screenCaptureUrl);
      console.log("Screen captured and state updated");
    } catch (error) {
      console.error("Error capturing screen:", error);
      setScreenCapture(null);
      setHasScreenPermission(false);
      setScreenCaptureTrack(null);
    }
  };

  const startCalibration = async () => {
    console.log("Starting calibration");
    if (!hasScreenPermission) {
      console.log("No screen permission, requesting...");
      await requestScreenPermission();
    }
    if (!hasScreenPermission) {
      console.log("Screen permission denied");
      alert("Screen capture permission is required to proceed.");
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    audioContextRef.current = new AudioContext();
    analyserRef.current = audioContextRef.current.createAnalyser();
    const source = audioContextRef.current.createMediaStreamSource(stream);
    source.connect(analyserRef.current);

    setIsCalibrating(true);
    setMatchedWords(new Set());
    setTimeLeft(20);

    let maxVolume = 0;
    const checkVolume = () => {
      const dataArray = new Uint8Array(analyserRef.current!.frequencyBinCount);
      analyserRef.current!.getByteFrequencyData(dataArray);
      const volume =
        dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
      maxVolume = Math.max(maxVolume, volume);
    };

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join(" ");
      setCalibrationTranscript(transcript);

      const spokenWords = new Set(
        transcript
          .toLowerCase()
          .split(/\s+/)
          .filter((word) => word.length > 3)
      );
      const newMatchedWords = new Set(matchedWords);
      requiredWords.forEach((word) => {
        if (spokenWords.has(word)) {
          newMatchedWords.add(word);
        }
      });
      setMatchedWords(newMatchedWords);

      const allWordsSpoken = requiredWords.every((word) =>
        newMatchedWords.has(word)
      );

      if (allWordsSpoken) {
        completeCalibration(recognition, maxVolume);
      }

      checkVolume();
    };

    recognitionRef.current = recognition;
    recognition.start();

    startTimer();
  };

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      const newTimeLeft = Math.max(20 - elapsedSeconds, 0);
      setTimeLeft(newTimeLeft);
      if (newTimeLeft === 0) {
        clearInterval(timerRef.current!);
        checkCalibrationCompletion();
      }
    }, 1000);
  };

  const checkCalibrationCompletion = () => {
    const matchPercentage = (matchedWords.size / requiredWords.length) * 100;
    if (matchPercentage >= 60) {
      completeCalibration(
        recognitionRef.current,
        analyserRef.current!.maxDecibels
      );
    } else {
      restartCalibration();
    }
  };

  const restartCalibration = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    setIsCalibrating(false);
    setCalibrationComplete(false);
    setTimeout(() => {
      startCalibration();
    }, 1000);
  };

  const completeCalibration = (recognition: any, maxVolume: number) => {
    recognition.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    setThreshold(maxVolume * 0.8);
    setIsCalibrating(false);
    setCalibrationComplete(true);
    startListening();
  };

  const startListening = async () => {
    console.log("Starting listening phase");
    setIsListening(true);

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      const dataArray = new Uint8Array(analyserRef.current!.frequencyBinCount);
      analyserRef.current!.getByteFrequencyData(dataArray);
      const volume =
        dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;

      if (volume > threshold && !isRecording) {
        setWarning(true);
        recognition.stop();
        startRecording();
        setTimeout(() => setWarning(false), 5000);
      }

      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join("");
      setTranscript(transcript);
    };

    recognition.onend = () => {
      if (isListening && !isRecording) {
        recognition.start();
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const startRecording = () => {
    if (isRecording) return;

    setIsRecording(true);
    const mediaRecorder = new MediaRecorder(streamRef.current!);
    mediaRecorderRef.current = mediaRecorder;

    const chunks: BlobPart[] = [];
    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: "audio/ogg; codecs=opus" });
      setAudioBlobs((prev) => [...prev, blob]);
      const url = URL.createObjectURL(blob);
      setAudioUrls((prev) => [...prev, url]);
      setIsRecording(false);

      startListening();
    };

    mediaRecorder.start();
    setTimeout(() => {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state === "recording"
      ) {
        mediaRecorderRef.current.stop();
      }
    }, 5000);
  };

  const stopEverything = () => {
    console.log("Stopping everything");
    setIsListening(false);
    setIsRecording(false);

    // Stop speech recognition
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current.abort(); // This will fully abort the recognition
    }

    // Stop media recorder
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
    }

    // Stop and clear audio stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
        streamRef.current.removeTrack(track);
      });
      streamRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Clear screen capture track
    if (screenCaptureTrack) {
      screenCaptureTrack.stop();
      setScreenCaptureTrack(null);
    }

    // Stop any ongoing getUserMedia streams
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        stream.getTracks().forEach((track) => track.stop());
      })
      .catch((err) => console.error("Error accessing media devices.", err));

    // Reset states
    setHasScreenPermission(false);
    setScreenCapture(null);
    setTranscript("");
    setWarning(false);
    setAudioBlobs([]);
    setAudioUrls([]);

    console.log("All processes stopped and cleared");
  };

  return (
    <div className="grid grid-rows-[auto_1fr_auto] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <h1 className="text-2xl font-bold">Speech Recognition Demo</h1>

      <div className="flex flex-col gap-4 items-center">
        {!hasScreenPermission && !isCalibrating && !isListening && (
          <div>
            <p className="mb-2">
              Please share your entire screen when prompted.
            </p>
            <button
              onClick={requestScreenPermission}
              className="px-4 py-2 bg-blue-500 text-white rounded"
            >
              Grant Full
            </button>
          </div>
        )}

        {hasScreenPermission && !isCalibrating && !isListening && (
          <button
            onClick={startCalibration}
            className="px-4 py-2 bg-blue-500 text-white rounded"
          >
            Start Calibration
          </button>
        )}
        {isCalibrating && (
          <div>
            <p>Please read the following text:</p>
            <p className="whitespace-pre-line bg-slate-800 p-4 rounded">
              {readingPrompt.split(/\s+/).map((word, index) => (
                <span
                  key={index}
                  className={
                    matchedWords.has(word.toLowerCase())
                      ? "text-green-500"
                      : "text-white"
                  }
                >
                  {word}{" "}
                </span>
              ))}
            </p>
            <p>Time left: {timeLeft} seconds</p>
            <p>Calibration transcript: {calibrationTranscript}</p>
            <p>
              Words matched: {matchedWords.size} / {requiredWords.length}
            </p>
          </div>
        )}
        {isListening && (
          <div>
            <p>Listening... (Threshold: {threshold.toFixed(2)})</p>
            {warning && (
              <p className="text-red-500 font-bold">
                Warning: Sound level exceeded!
              </p>
            )}
            {isRecording && (
              <p className="text-blue-500 font-bold">Recording audio...</p>
            )}
            <p className="w-[500px] text-balance">Transcript: {transcript}</p>
            <p>Recorded audio clips: {audioBlobs.length}</p>
            <div className="mt-4">
              <h2 className="text-lg font-semibold mb-2">
                Recorded Audio Clips:
              </h2>
              {audioUrls.map((url, index) => (
                <div key={index} className="mb-2">
                  <audio controls src={url} className="w-full">
                    Your browser does not support the audio element.
                  </audio>
                </div>
              ))}
            </div>
            {screenCapture && (
              <div className="mt-4">
                <h2 className="text-lg font-semibold mb-2">
                  Latest Screen Capture:
                </h2>
                <img
                  src={screenCapture}
                  alt="Screen Capture"
                  className="max-w-full h-auto border border-gray-300"
                />
              </div>
            )}
            <button
              onClick={stopEverything}
              className="px-4 py-2 bg-red-500 text-white rounded mt-4"
            >
              Stop Listening and Clear
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
