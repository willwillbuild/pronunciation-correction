"use client";

import Image from 'next/image'
import React, { useState, useEffect } from 'react'

import { convertAudioBufferToWavBlob, } from './utils.js';


const AudioRecorder = ({ selectedLanguage, textToRead, setModifiedText }: 
    { selectedLanguage: string, textToRead: string, setModifiedText: Function }) => {
    const [mediaRecorder, setMediaRecorder] = useState<any>(null);
    const [isRecording, setIsRecording] = useState(false);
    let localAudioChunks: Blob[] = [];

    useEffect(() => {
        const initRecorder = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });

                recorder.addEventListener('dataavailable', async (event) => {
                    console.log('dataavailable', event.data);
                    localAudioChunks.push(event.data); // Push chunks to local array instead of state
                    console.log('localaudiochunks', localAudioChunks);
                });

                recorder.addEventListener('stop', async () => {
                    console.log('localaudiochunks', localAudioChunks);
                    const webmBlob = localAudioChunks[0];

                    // Convert to array buffer
                    const arrayBuffer = await webmBlob.arrayBuffer();
                    console.log('arrayBuffer', arrayBuffer);

                    // Use AudioContext to decode our array buffer into an audio buffer
                    const audioContext = new AudioContext();
                    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

                    console.log("audioBuffer: ", audioBuffer);
                    // Convert the WebM blob to a WAV blob
                    const wavBlob = await convertAudioBufferToWavBlob(audioBuffer); // Ensure convertAudioBufferToWavBlob accepts arrayBuffer
                    
                    console.log("wavBlob: ", wavBlob);
                    
                    analyzeAndDisplayPronunciation(wavBlob);
                    localAudioChunks = []; // Reset local array
                });

                setMediaRecorder(recorder);
            } catch (err) {
                console.error('Error initializing media recorder:', err);
            }
        };

        initRecorder();
    }, [textToRead]);

    const toggleRecording = () => {
        if (isRecording) {
            mediaRecorder.stop();
        } else {
            mediaRecorder.start();
        }
        setIsRecording(!isRecording);
    };

    const analyzeAndDisplayPronunciation = async (audioBlob: Blob) => {
        if (!audioBlob || audioBlob.size === 0 || audioBlob.type !== 'audio/wav') {
            console.error('Invalid audio blob');
            return;
        }

        console.log('textToRead', textToRead);

        const formData = new FormData();
        formData.append("audio", audioBlob);
        formData.append("language", selectedLanguage);
        formData.append("textToRead", textToRead);

        try {
            const response = await fetch('/api/analyze-pronunciation', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error('Network response was not ok');
            }

            let coloredText = "";
            data.NBest[0].Words.forEach((wordData: any) => {
                const word = wordData.Word;
                const wordAccuracy = wordData.PronunciationAssessment.AccuracyScore;
                let wordSpan = '';

                for (let letterIdx = 0; letterIdx < word.length; letterIdx++) {
                    let letterIsCorrect = wordAccuracy >= 80; // Adjust accuracy threshold as needed
                    let colorLetter = letterIsCorrect ? 'green' : 'red';
                    wordSpan += `<span style="color: ${colorLetter};">${word[letterIdx]}</span>`;
                }

                coloredText += ` ${wordSpan}`;
            });

            setModifiedText(coloredText);
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <div>
            <button id='record-button' onClick={toggleRecording}>
                {isRecording ? '🛑 Stop' : '🎤 Record'}
            </button>
        </div>
    );
};


function Header() {
    return (
        <div className="flex flex-row justify-between items-center">
            <div className="flex flex-row items-center gap-4">
                {/* <Image src="/logo.svg" width="48" height="48" alt={''} /> */}
                <h1 className="text-4xl font-bold">Pronunciation Corrector</h1>
            </div>
        </div>
    )
}

interface LanguageSelectorProps {
    onLanguageChange: (language: string) => void;
}

function LanguageSelector({ onLanguageChange }: LanguageSelectorProps) {
    return (
        <select name="lang" id="lang" onChange={(e) => onLanguageChange(e.target.value)}>
            <option value="zh-CN">Mandarin</option>
            <option value="en-US">English</option>
            <option value="zh-HK">Cantonese</option>
            <option value="ja-JP">Japanese</option>
        </select>
    )
}

export default function Home(this: any) {
    const [selectedLanguage, setSelectedLanguage] = useState('zh-CN');
    const [textToRead, setTextToRead] = useState('我们去了好多地方玩，所以不要去别的地方了。');
    const [modifiedText, setModifiedText] = useState('');


    const handleLanguageChange = (language: string) => {
        setSelectedLanguage(language);
    };

    const handleTextChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setTextToRead(event.target.value);
    };

    return (
        <div className="px-32 flex flex-col items-center justify-center">
            <Header />
            <div className="flex flex-row gap-4 items-center justify-center mt-4">
                <LanguageSelector onLanguageChange={handleLanguageChange} />
                <AudioRecorder
                    selectedLanguage={selectedLanguage}
                    textToRead={textToRead}
                    setModifiedText={setModifiedText}
                />
            </div>
            <div className="mt-4">
                Type Text To Pronounce
                <input
                    type="text"
                    value={textToRead}
                    onChange={handleTextChange}
                    className="w-full p-2 border border-gray-300 rounded"
                    placeholder="Enter text to read..."
                />
            </div>
            <div className="mt-4 w-full flex justify-center">
                <div dangerouslySetInnerHTML={{ __html: modifiedText || textToRead }}></div>
            </div>
        </div>
    )
}
