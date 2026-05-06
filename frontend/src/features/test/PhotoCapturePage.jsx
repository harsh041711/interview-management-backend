import { useCallback, useRef, useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import Webcam from 'react-webcam';
import Button from '@/components/common/Button';
import Loader from '@/components/common/Loader';
import { useToast } from '@/components/common/Toast';
import { uploadPhoto, validateToken } from './testSlice';
import './PhotoCapturePage.scss';

const VIDEO_CONSTRAINTS = { width: 720, height: 540, facingMode: 'user' };

const dataUrlToBlob = async (dataUrl) => (await fetch(dataUrl)).blob();

export default function PhotoCapturePage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { push } = useToast();
  const { token } = useParams();
  const { candidate, photoUploadStatus } = useSelector((s) => s.test);
  const [shot, setShot] = useState(null);
  const [error, setError] = useState(null);
  const camRef = useRef(null);

  useEffect(() => {
    if (!candidate && token) dispatch(validateToken({ token }));
  }, [candidate, dispatch, token]);

  const capture = useCallback(() => {
    const data = camRef.current?.getScreenshot();
    if (!data) {
      setError('Could not capture image — please retry.');
      return;
    }
    setError(null);
    setShot(data);
  }, []);

  const upload = async () => {
    if (!shot) return;
    try {
      const blob = await dataUrlToBlob(shot);
      const action = await dispatch(uploadPhoto({ token, blob }));
      if (uploadPhoto.fulfilled.match(action)) {
        push({ type: 'success', message: 'Photo saved' });
        navigate(`/test/${token}/run`);
      } else {
        push({ type: 'error', message: action.payload?.message || 'Upload failed' });
      }
    } catch (e) {
      push({ type: 'error', message: e.message || 'Upload failed' });
    }
  };

  if (!candidate) return <Loader fullscreen message="Loading…" />;

  return (
    <div className="photo-capture">
      <div className="photo-capture__card fade-in">
        <header>
          <h1>Photo verification</h1>
          <p className="photo-capture__sub">Make sure your face is clearly visible. This photo is sent to the recruiter as part of your submission.</p>
        </header>

        <div className="photo-capture__frame">
          {shot ? (
            <img src={shot} alt="Captured" />
          ) : (
            <Webcam
              ref={camRef}
              audio={false}
              screenshotFormat="image/jpeg"
              videoConstraints={VIDEO_CONSTRAINTS}
              onUserMediaError={(e) => setError(e?.message || 'Could not access camera')}
              mirrored
            />
          )}
        </div>

        {error && <div className="photo-capture__error">{error}</div>}

        <div className="photo-capture__actions">
          {shot ? (
            <>
              <Button variant="secondary" onClick={() => setShot(null)} disabled={photoUploadStatus === 'loading'}>Retake</Button>
              <Button onClick={upload} loading={photoUploadStatus === 'loading'}>Confirm &amp; continue</Button>
            </>
          ) : (
            <Button onClick={capture} fullWidth size="lg">📸 Capture photo</Button>
          )}
        </div>
      </div>
    </div>
  );
}
