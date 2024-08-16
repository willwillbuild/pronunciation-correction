import io
import uvicorn
import numpy as np
import nest_asyncio
from enum import Enum
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import azure.cognitiveservices.speech as speechsdk

from pydub import AudioSegment

import logging

from allosaurus.app import read_recognizer
from epitran import download
from epitran.backoff import Backoff
from Levenshtein import distance
import string 
import random 

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# epitran
download.cedict()
backoff = Backoff(['cmn-Hans'])

# load your model by the <model name>, will use 'latest' if left empty
model = read_recognizer()

app = FastAPI(title='Pronunciation Corrector ML Models with FastAPI')

# Set up the subscription info for the Speech Service:
# Replace with your own subscription key and service region (e.g., "westus").
speech_key, service_region = "KEY", "REGION"



def generateRandomString(str_length: int = 20):

    # printing lowercase
    letters = string.ascii_lowercase
    return ''.join(random.choice(letters) for i in range(str_length))

def save_audio_file_to_wav(audio_file):
    try:
        audio_filename = generateRandomString()
        with open(audio_filename + '.ogg', "wb") as buffer:
            buffer.write(audio_file.file.read())
        ogg2wav(audio_filename)
        audio_filename = audio_filename + '.wav'
        return audio_filename
    except Exception as e:
        # Log the exception
        print(e)
        logger.error(f"Error saving audio file: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
def home():
    return "Congratulations! Your API is working as expected. Now head over to http://localhost:8000/docs."

def ogg2wav(ofn):
    wfn = ofn.replace('.ogg','.wav')
    x = AudioSegment.from_file(ofn)
    x.export(wfn, format='wav')

@app.post("/phonetic-distance") 
async def comparePhoneticDistances(audio: UploadFile = File(...), textToRead: str = Form(...), language: str = Form(...)):
    try:
        audio_filename = save_audio_file_to_wav(audio)
        
        model_recognized_phonemes = model.recognize("audio.wav", "cmn") # cmn is chinese
        print(model_recognized_phonemes)
        target_phonemes = backoff.transliterate(textToRead)
        print(target_phonemes)
        phonetic_edit_distance = distance(model_recognized_phonemes, target_phonemes)
        print(phonetic_edit_distance)
        return phonetic_edit_distance
    except Exception as e:
        # Log the exception
        print(e)
        logger.error(f"Error in /phonetic-distance: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

'''
Languages supported by Azure Speech to Text:

Chinese (Simplified) zh-CN
Chinese (Canto Traditional) zh-HK
English (Australia) 	en-AU
English (Canada) 	en-CA
English (India) 	en-IN
English (United Kingdom) 	en-GB
English (United States) 	en-US
Japanese (Japan) 	ja-JP
Korean (Korea) 	ko-KR
Spanish (Mexico) 	es-MX
Spanish (Spain) 	es-ES
'''

@app.post("/pronunciation-assessment")
def pronunciation_assessment(audio: UploadFile = File(...), textToRead: str = Form(...), language: str = Form(...)):
    try:
        audio_filename = save_audio_file_to_wav(audio)
        speech_config = speechsdk.SpeechConfig(subscription=speech_key, region=service_region)
        # Generally, the waveform should longer than 20s and the content should be more than 3 sentences.
        audio_config = speechsdk.audio.AudioConfig(filename=audio_filename)

        pronunciation_config = speechsdk.PronunciationAssessmentConfig(
            grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
            granularity=speechsdk.PronunciationAssessmentGranularity.Phoneme,
            enable_miscue=False)
        pronunciation_config.enable_prosody_assessment()

        # Create a speech recognizer using a file as audio input.
        language = 'zh-CN'
        speech_recognizer = speechsdk.SpeechRecognizer(
            speech_config=speech_config, language=language, audio_config=audio_config)
        # Apply pronunciation assessment config to speech recognizer
        pronunciation_config.apply_to(speech_recognizer)

        done = False
        pron_results = []
        recognized_text = ""
        json_result = ""

        def stop_cb(evt):
            """callback that signals to stop continuous recognition upon receiving an event `evt`"""
            print("CLOSING on {}".format(evt))
            nonlocal done
            done = True

        def recognized(evt):
            nonlocal pron_results, recognized_text, json_result
            print(evt.result.properties.get(speechsdk.PropertyId.SpeechServiceResponse_JsonResult))
            json_result = evt.result.properties.get(speechsdk.PropertyId.SpeechServiceResponse_JsonResult)
            if (evt.result.reason == speechsdk.ResultReason.RecognizedSpeech or
                    evt.result.reason == speechsdk.ResultReason.NoMatch):
                pron_results.append(speechsdk.PronunciationAssessmentResult(evt.result))
                if evt.result.text.strip().rstrip(".") != "":
                    print(f"Recognizing: {evt.result.text}")
                    recognized_text += " " + evt.result.text.strip()

        # Connect callbacks to the events fired by the speech recognizer
        speech_recognizer.recognized.connect(recognized)
        speech_recognizer.session_started.connect(lambda evt: print("SESSION STARTED: {}".format(evt)))
        speech_recognizer.session_stopped.connect(lambda evt: print("SESSION STOPPED {}".format(evt)))
        speech_recognizer.canceled.connect(lambda evt: print("CANCELED {}".format(evt)))
        # Stop continuous recognition on either session stopped or canceled events
        speech_recognizer.session_stopped.connect(stop_cb)
        speech_recognizer.canceled.connect(stop_cb)
        return json_result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

