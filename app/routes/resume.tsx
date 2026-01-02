import {Link, useNavigate, useParams} from "react-router";
import {useEffect, useState, useRef} from "react";
import {usePuterStore} from "~/lib/puter";
import Summary from "~/components/Summary";
import ATS from "~/components/ATS";
import Details from "~/components/Details";

export const meta = () => ([
    { title: 'ai-Ana | Review ' },
    { name: 'description', content: 'Detailed overview of your resume' },
])

const Resume = () => {
    const { auth, isLoading, fs, kv } = usePuterStore();
    const { id } = useParams();
    const [imageUrl, setImageUrl] = useState('');
    const [resumeUrl, setResumeUrl] = useState('');
    const [feedback, setFeedback] = useState<Feedback | null>(null);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    // keep track of created object URLs so we can revoke them on cleanup
    const createdUrls = useRef<string[]>([]);

    useEffect(() => {
        if(!isLoading && !auth.isAuthenticated) navigate(`/auth?next=/resume/${id}`);
    }, [isLoading, auth, navigate, id])

    useEffect(() => {
        let mounted = true;

        const pushUrl = (u: string) => {
            createdUrls.current.push(u);
        };

        const makeBlobFromPossible = (data: any, fallbackMime = 'application/pdf') => {
            // handle many possible return types:
            if (!data) return null;
            // If it's already a Blob
            if (typeof Blob !== 'undefined' && data instanceof Blob) return data;
            // If it's ArrayBuffer or view
            if (data instanceof ArrayBuffer) return new Blob([data], { type: fallbackMime });
            if (ArrayBuffer.isView(data)) return new Blob([data.buffer], { type: fallbackMime });
            // If it's a base64 string
            if (typeof data === 'string') {
                // try data URL "data:...;base64,..." or raw base64
                try {
                    const base64 = data.includes('base64,') ? data.split('base64,')[1] : data;
                    const binary = atob(base64);
                    const len = binary.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
                    return new Blob([bytes], { type: fallbackMime });
                } catch (e) {
                    console.warn('makeBlobFromPossible failed to decode string data', e);
                    return null;
                }
            }
            // Last resort: try to JSON.stringify then make a blob
            try {
                return new Blob([JSON.stringify(data)], { type: fallbackMime });
            } catch (e) {
                return null;
            }
        };

        const loadResume = async () => {
            try {
                const resumeKV = await kv.get(`resume:${id}`);
                if(!resumeKV) {
                    if (!mounted) return;
                    setError('Resume not found in kv.');
                    return;
                }

                const data = JSON.parse(resumeKV);

                // -------- Resume PDF --------
                const resumeRaw = await fs.read(data.resumePath);
                if (!resumeRaw) {
                    if (!mounted) return;
                    setError('Failed to read resume PDF from fs.');
                    return;
                }

                const pdfBlob = makeBlobFromPossible(resumeRaw, 'application/pdf');
                if (!pdfBlob) {
                    if (!mounted) return;
                    setError('Could not create PDF blob from resume data.');
                    return;
                }

                const newResumeUrl = URL.createObjectURL(pdfBlob);
                pushUrl(newResumeUrl);
                if (mounted) setResumeUrl(newResumeUrl);

                // -------- Image (preview) --------
                const imageRaw = await fs.read(data.imagePath);
                if (imageRaw) {
                    const imgBlob = makeBlobFromPossible(imageRaw, 'image/png') || makeBlobFromPossible(imageRaw, 'image/jpeg');
                    if (imgBlob) {
                        const newImageUrl = URL.createObjectURL(imgBlob);
                        pushUrl(newImageUrl);
                        if (mounted) setImageUrl(newImageUrl);
                    } else {
                        console.warn('Could not convert image data to Blob; skipping image preview.');
                    }
                } else {
                    console.warn('No image found at imagePath; skipping image preview.');
                }

                if (mounted) {
                    setFeedback(data.feedback || null);
                    setError(null);
                }

                console.log({ resumeUrl: newResumeUrl, imageUrl, feedback: data.feedback });
            } catch (err: any) {
                console.error('Error loading resume:', err);
                if (mounted) setError(err?.message || String(err));
            }
        }

        loadResume();

        return () => {
            mounted = false;
            // revoke object URLs we created
            for (const u of createdUrls.current) {
                try { URL.revokeObjectURL(u); } catch (e) { /* ignore */ }
            }
            createdUrls.current = [];
        };
    }, [id, fs, kv]);

    return (
        <main className="!pt-0">
            <nav className="resume-nav">
                <Link to="/" className="back-button">
                    <img src="/icons/back.svg" alt="logo" className="w-2.5 h-2.5" />
                    <span className="text-gray-800 text-sm font-semibold">Back to Homepage</span>
                </Link>
            </nav>
            <div className="flex flex-row w-full max-lg:flex-col-reverse">
                <section className="feedback-section bg-[url('/images/bg-small.svg')] bg-cover h-[100vh] sticky top-0 items-center justify-center">
                    {imageUrl && resumeUrl && (
                        <div className="animate-in fade-in duration-1000 gradient-border max-sm:m-0 h-[90%] max-wxl:h-fit w-fit">
                            <a href={resumeUrl} target="_blank" rel="noopener noreferrer">
                                <img
                                    src={imageUrl}
                                    className="w-full h-full object-contain rounded-2xl"
                                    title="resume"
                                />
                            </a>
                        </div>
                    )}
                </section>
                <section className="feedback-section">
                    <h2 className="text-4xl !text-black font-bold">Resume Review</h2>
                    {error && <div className="text-red-600">Error: {error}</div>}
                    {feedback ? (
                        <div className="flex flex-col gap-8 animate-in fade-in duration-1000">
                            <Summary feedback={feedback} />
                            <ATS score={feedback.ATS.score || 0} suggestions={feedback.ATS.tips || []} />
                            <Details feedback={feedback} />
                        </div>
                    ) : (
                        <img src="/images/resume-scan-2.gif" className="w-full" />
                    )}
                </section>
            </div>
        </main>
    )
}
export default Resume
