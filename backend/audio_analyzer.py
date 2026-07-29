import librosa


def analyze_audio(file_path):

    y, sr = librosa.load(file_path)


    # BPM
    tempo, _ = librosa.beat.beat_track(
        y=y,
        sr=sr
    )


    # 에너지
    rms = librosa.feature.rms(y=y)
    energy = float(rms.mean())


    # 음색 특징
    mfcc = librosa.feature.mfcc(
        y=y,
        sr=sr,
        n_mfcc=13
    )


    return {
        "tempo": float(tempo),
        "energy": energy,
        "mfcc": mfcc.tolist()
    }
