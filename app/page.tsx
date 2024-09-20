// @ts-nocheck
"use client";

import { useEffect, useState, useRef } from "react";
import { FilesetResolver, AudioClassifier } from "@mediapipe/tasks-audio";

const SCORE_THRESHOLD = 0.1;
const RECORDING_THRESHOLD = 0.2; // Adjust as needed
const RECORDING_TIMEOUT = 1000; // 1 second
const MAX_RECORDINGS = 10;

export default function Home() {
  const [classificationResults, setClassificationResults] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [audioClassifier, setAudioClassifier] = useState(null);
  const [recordings, setRecordings] = useState([]);
  const mediaRecorderRef = useRef(null);
  const recordingTimeoutRef = useRef(null);
  const audioContextRef = useRef(null);
  const streamRef = useRef(null);

  // Initialize the Mediapipe Audio Classifier
  useEffect(() => {
    const initializeMediapipe = async () => {
      const audio = await FilesetResolver.forAudioTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio/wasm"
      );

      const classifier = await AudioClassifier.createFromOptions(audio, {
        baseOptions: {
          modelAssetPath: "/yamnet.tflite",
        },
        runningMode: "AUDIO_STREAM", // Stream mode for continuous audio classification
        maxResults: 5,
        // scoreThreshold: 0.5,
      });

      setAudioClassifier(classifier);
    };

    initializeMediapipe();
  }, []);

  // Stream audio and classify in real-time
  const handleProctoring = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;
    const mediaStreamSource = audioContext.createMediaStreamSource(stream);

    const processAudio = async () => {
      const bufferSize = 1024;
      const audioBuffer = new Float32Array(bufferSize);

      const scriptNode = audioContext.createScriptProcessor(bufferSize, 1, 1);
      mediaStreamSource.connect(scriptNode);
      scriptNode.connect(audioContext.destination);

      scriptNode.onaudioprocess = (audioProcessingEvent) => {
        const inputBuffer = audioProcessingEvent.inputBuffer;
        const inputData = inputBuffer.getChannelData(0);

        const results = audioClassifier.classify(
          inputData,
          audioContext.sampleRate
        );

        const highestScore = Math.max(
          ...results[0].classifications[0].categories.map((c) => c.score)
        );

        if (
          highestScore >= RECORDING_THRESHOLD &&
          recordings.length < MAX_RECORDINGS
        ) {
          if (!mediaRecorderRef.current) {
            startRecording();
          }
          if (recordingTimeoutRef.current) {
            clearTimeout(recordingTimeoutRef.current);
          }
          recordingTimeoutRef.current = setTimeout(() => {
            stopRecording();
          }, RECORDING_TIMEOUT);
        }

        setClassificationResults(
          results[0].classifications[0].categories
            .filter((category) => category.score >= SCORE_THRESHOLD)
            .map((category) => ({
              name: category.categoryName,
              score: category.score.toFixed(3),
            }))
        );

        if (!isListening) {
          scriptNode.disconnect();
          stopRecording();
        }
      };
    };

    setIsListening(true);
    processAudio();
  };

  const startRecording = () => {
    if (mediaRecorderRef.current || recordings.length >= MAX_RECORDINGS) return;

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const chunks = [];

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/ogg; codecs=opus" });
        const url = URL.createObjectURL(blob);
        setRecordings((prev) => [...prev, url].slice(-MAX_RECORDINGS));
        mediaRecorderRef.current = null;
      };

      mediaRecorder.start();
    });
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }
  };

  const stopProctoring = () => {
    setIsListening(false);

    // Stop the MediaRecorder if it's running
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }

    // Clear any ongoing recording timeout
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
    }

    // Stop all tracks in the stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    // Close the AudioContext
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }

    // Reset refs
    mediaRecorderRef.current = null;
    recordingTimeoutRef.current = null;
    streamRef.current = null;
    audioContextRef.current = null;
  };

  return (
    <div className="grid grid-rows-[auto_1fr_auto] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <h1 className="text-2xl font-bold">Audio Classifier Demo</h1>

      <div className="flex flex-col gap-4 w-full justify-center items-center">
        <h1>Proctoring</h1>
        <button onClick={handleProctoring} disabled={isListening}>
          Start Proctoring
        </button>
        <button onClick={stopProctoring} disabled={!isListening}>
          Stop Proctoring
        </button>
        {classificationResults.length > 0 && (
          <div>
            <h2>Classification Results:</h2>
            {classificationResults.length > 0 ? (
              classificationResults.map((result, index) => (
                <p key={index}>
                  {index + 1}. {result.name} ({result.score})
                </p>
              ))
            ) : (
              <p>No results above the threshold.</p>
            )}
          </div>
        )}
      </div>

      {recordings.length > 0 && (
        <div className="flex flex-col gap-4 w-full items-end justify-end">
          <h2>Recordings:</h2>
          {recordings.map((url, index) => (
            <div key={index}>
              <audio src={url} controls />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
