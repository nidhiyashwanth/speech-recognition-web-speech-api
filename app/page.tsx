// @ts-nocheck
"use client";

import { useEffect, useState, useRef } from "react";

export default function Home() {
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [threshold, setThreshold] = useState(0);
  const [timeLeft, setTimeLeft] = useState(20);
  const [warning, setWarning] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlobs, setAudioBlobs] = useState<Blob[]>([]);
  const [audioUrls, setAudioUrls] = useState<string[]>([]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const readingPrompt = `Please read the following text aloud:
    "The quick brown fox jumps over the lazy dog. 
    Pack my box with five dozen liquor jugs. 
    How vexingly quick daft zebras jump! 
    The five boxing wizards jump quickly. 
    Sphinx of black quartz, judge my vow."`;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  const startCalibration = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    audioContextRef.current = new AudioContext();
    analyserRef.current = audioContextRef.current.createAnalyser();
    const source = audioContextRef.current.createMediaStreamSource(stream);
    source.connect(analyserRef.current);

    setIsCalibrating(true);
    setTimeLeft(20);

    let maxVolume = 0;
    const checkVolume = () => {
      const dataArray = new Uint8Array(analyserRef.current!.frequencyBinCount);
      analyserRef.current!.getByteFrequencyData(dataArray);
      const volume =
        dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
      maxVolume = Math.max(maxVolume, volume);
    };

    timerRef.current = setInterval(() => {
      setTimeLeft((prevTime) => {
        if (prevTime <= 1) {
          clearInterval(timerRef.current!);
          setThreshold(maxVolume * 0.8);
          setIsCalibrating(false);
          startListening(stream);
          return 0;
        }
        checkVolume();
        return prevTime - 1;
      });
    }, 1000);
  };

  const startListening = () => {
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
    if (isRecording) return; // Prevent starting a new recording if one is already in progress

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

      // Restart listening after recording is complete
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

  return (
    <div className="grid grid-rows-[auto_1fr_auto] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <h1 className="text-2xl font-bold">Speech Recognition Demo</h1>

      <div className="flex flex-col gap-4 items-center">
        {!isCalibrating && !isListening && (
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
              {readingPrompt}
            </p>
            <p>Time left: {timeLeft} seconds</p>
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
          </div>
        )}
      </div>
    </div>
  );
}
