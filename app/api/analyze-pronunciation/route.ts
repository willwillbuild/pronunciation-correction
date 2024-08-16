import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink } from 'fs/promises';
import { v4 as uuidv4 } from 'uuid'; // UUID library to generate a random string

import * as fs from 'fs';
import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import * as tmp from 'tmp';


const subscriptionKey = process.env.AZURE_SPEECH_KEY ?? '';
const serviceRegion = process.env.AZURE_SPEECH_REGION ?? '';


export async function GET(request: NextRequest) {
    return new NextResponse(JSON.stringify({ message: 'Hello from the API' }), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
        },
    });
}

export async function POST(request: NextRequest) {
    try {
        // Retrieve FormData from the request
        const formData = await request.formData();

        // Log each field in the FormData
        for (const [key, value] of formData.entries()) {
            console.log(`${key}: ${value}`);
        }
        
        // Access the incoming audio data
        // const audioData = await request.arrayBuffer();
        const textToRead = formData.get('textToRead') as string;
        const language = formData.get('language') as string;

        console.log('Text to read:', textToRead);
        console.log('Language:', language);

        // Generate a random filename
        const filename = '/tmp/' + uuidv4();
        
        // Get the audio file from FormData and save it
        const audioBlob = formData.get('audio');
        if (audioBlob instanceof Blob) {
            const buffer = Buffer.from(await audioBlob.arrayBuffer());
            const outputFilename = filename + '.wav'; // Full path
        
            try {
                await fs.promises.writeFile(outputFilename, buffer);
                console.log('File saved successfully');
            } catch (err) {
                console.error('Saving failed:', err);
            }
        }

        // Pass the filename to the recognition function (replace this with your recognition function)
        const recognitionResult = await correctPronunciation(textToRead, language, filename + '.wav');
        // const recognitionResult = await correctPronunciation(textToRead, language, filename);
        console.log('Recognition result:', recognitionResult);

        // Delete the wav file
        await unlink(filename + '.wav');

        // Return the response
        return new NextResponse(JSON.stringify(recognitionResult), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    } catch (error: any) {
        // Handle any errors
        console.error(error.message);
        return new NextResponse(JSON.stringify({ error: 'Internal Server Error' }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }
}

async function correctPronunciation(textToRead: string, language: string, filename: string) {
    return new Promise((resolve, reject) => {
        console.log('Recognizing audio from file:', filename);
        const audioConfig = sdk.AudioConfig.fromWavFileInput(fs.readFileSync(filename));
        const speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, serviceRegion);
        speechConfig.speechRecognitionLanguage = language;

        const pronunciationAssessmentConfig = new sdk.PronunciationAssessmentConfig(
            textToRead,
            sdk.PronunciationAssessmentGradingSystem.HundredMark,
            sdk.PronunciationAssessmentGranularity.Phoneme,
            false
        );
        // pronunciationAssessmentConfig.enableProsodyAssessment = true;

        const reco = new sdk.SpeechRecognizer(speechConfig, audioConfig);
        pronunciationAssessmentConfig.applyTo(reco);

        let result = '';
        let recognizedText = "";

        reco.recognized = (s, e) => {
            const jo = JSON.parse(e.result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult));
            if (jo.DisplayText !== ".") {
                recognizedText += jo.DisplayText + " ";
            }
            result = jo;
        };

        reco.canceled = (s, e) => {
            if (e.reason === sdk.CancellationReason.Error) {
                const errorDetails = `(cancel) Reason: ${sdk.CancellationReason[e.reason]}: ${e.errorDetails}`;
                console.error('Recognition canceled due to error:', errorDetails);
                reco.close();
                reject(errorDetails);
            }
        };

        reco.sessionStopped = (s, e) => {
            console.log('Recognition session stopped');
            reco.close();
            resolve(result);
        };

        console.log('Starting recognition');
        reco.startContinuousRecognitionAsync(() => {
            console.log("Recognition started");
        }, (error) => {
            console.error("Recognition error:", error);
            reject(error);
        });

        var timeout = 10000;
        // Timeout to stop recognition after specified duration
        setTimeout(() => {
            console.log(`Stopping recognition after ${timeout} milliseconds`);
            reco.stopContinuousRecognitionAsync();
        }, timeout);
        // Consider adding a timeout or a condition to stop recognition
    });
}

// Function here to compare microsoft recognition capabilities
async function recognizeSpeech(textToRead: string, language: string, filename: string) {
    const audioConfig = sdk.AudioConfig.fromWavFileInput(fs.readFileSync(filename + '.wav'));
    const speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, serviceRegion);
    speechConfig.speechRecognitionLanguage = language;

    let speechRecognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
    return new Promise((resolve, reject) => {
        speechRecognizer.recognizeOnceAsync(result => {
            switch (result.reason) {
                case sdk.ResultReason.RecognizedSpeech:
                    console.log(`RECOGNIZED: Text=${result.text}`);
                    resolve(result);
                    break;
                case sdk.ResultReason.NoMatch:
                    console.log("NOMATCH: Speech could not be recognized.");
                    break;
                case sdk.ResultReason.Canceled:
                    const cancellation = sdk.CancellationDetails.fromResult(result);
                    console.log(`CANCELED: Reason=${cancellation.reason}`);
    
                    if (cancellation.reason == sdk.CancellationReason.Error) {
                        console.log(`CANCELED: ErrorCode=${cancellation.ErrorCode}`);
                        console.log(`CANCELED: ErrorDetails=${cancellation.errorDetails}`);
                        console.log("CANCELED: Did you set the speech resource key and region values?");
                    }
                    break;
            }
            speechRecognizer.close();
        });
    });
    
}
