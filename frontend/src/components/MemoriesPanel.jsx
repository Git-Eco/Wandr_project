import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { getDayMemories, saveMemory, deleteMemory } from '../api/client'
import styles from './MemoriesPanel.module.css'

const IcoCamera = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 0 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
const IcoTrash  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
const IcoSave   = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>

export default function MemoriesPanel({ tripId, dayNum }) {
  const [memories, setMemories]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [note, setNote]           = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setPreview]= useState(null)
  const [saving, setSaving]       = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const fileRef = useRef()
  

  // Load memories for this day
  useEffect(() => {
    setLoading(true)
    setMemories([])
    getDayMemories(tripId, dayNum)
      .then(setMemories)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [tripId, dayNum])

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be under 5MB.')
      return
    }
    setImageFile(file)
    setPreview(URL.createObjectURL(file))
  }

  function clearImage() {
    setImageFile(null)
    setPreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleSave() {
    if (!note.trim() && !imageFile) return
    setSaving(true)

    try {
      let image_url  = ''
      let image_path = ''

      if (imageFile) {
        const { data: { user } } = await supabase.auth.getUser()
        const ext  = imageFile.name.split('.').pop()
        const path = `${user.id}/${tripId}/day${dayNum}-${Date.now()}.${ext}`

        const { error: uploadErr } = await supabase.storage
          .from('memories')
          .upload(path, imageFile, { upsert: false })

        if (uploadErr) throw uploadErr

        const { data: signed } = await supabase.storage
          .from('memories')
          .createSignedUrl(path, 60 * 60 * 24 * 365)

        image_url  = signed?.signedUrl ?? ''
        image_path = path
      }

      const newMemory = await saveMemory({
        trip_id: tripId,
        day_num: dayNum,
        note: note.trim(),
        image_url,
        image_path,
      })

      setMemories(prev => [...prev, newMemory])
      setNote('')
      clearImage()
    } catch (err) {
      alert('Could not save memory: ' + (err.message || 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(memory) {
    setDeletingId(memory.id)
    try {
      await deleteMemory(memory.id)
      setMemories(prev => prev.filter(m => m.id !== memory.id))
    } catch {
      alert('Could not delete memory.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className={styles.panel}>
      <h4 className={styles.heading}><IcoCamera /> Memories — Day {dayNum}</h4>

      {/* ── Saved memories ── */}
      {loading ? (
        <div className={styles.loadingRow}>
          <div className="spinner" style={{ width: 20, height: 20 }} />
        </div>
      ) : memories.length === 0 ? (
        <div className={styles.empty}>No memories yet for this day. Add one below!</div>
      ) : (
        <div className={styles.memoryList}>
          {memories.map(m => {
            const dateStr = new Date(m.created_at).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric'
            })

            if (m.image_url) {
              // Two-column layout: photo left, notebook right
              return (
                <div key={m.id} className={styles.memoryCard}>
                  <div
                    className={styles.memoryPhotoSide}
                    onClick={() => window.open(m.image_url, '_blank')}
                    title="Click to view full size"
                  >
                    <img src={m.image_url} alt="Memory" className={styles.memoryImg} />
                  </div>
                  <div className={styles.memoryNotebookSide}>
                    {m.note && <p className={styles.memoryNote}>{m.note}</p>}
                    <div className={styles.memoryFooter}>
                      <span className={styles.memoryDate}>{dateStr}</span>
                      <button
                        className={styles.deleteBtn}
                        onClick={() => handleDelete(m)}
                        disabled={deletingId === m.id}
                        title="Delete memory"
                      >
                        {deletingId === m.id ? '…' : <IcoTrash />}
                      </button>
                    </div>
                  </div>
                </div>
              )
            }

            // Full-width notebook card (no image)
            return (
              <div key={m.id} className={styles.memoryCardNoImg}>
                <div className={styles.memoryNotebookSide}>
                  {m.note && <p className={styles.memoryNote}>{m.note}</p>}
                  <div className={styles.memoryFooter}>
                    <span className={styles.memoryDate}>{dateStr}</span>
                    <button
                      className={styles.deleteBtn}
                      onClick={() => handleDelete(m)}
                      disabled={deletingId === m.id}
                      title="Delete memory"
                    >
                      {deletingId === m.id ? '…' : <IcoTrash />}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Add memory form ── */}
      <div className={styles.form}>
        <div className={styles.formRow}>
          {/* Left: image picker */}
          <div className={styles.formPhotoCol}>
            {imagePreview ? (
              <div className={styles.previewWrap}>
                <img src={imagePreview} alt="Preview" className={styles.preview} />
                <button className={styles.clearImg} onClick={clearImage}>✕ Remove</button>
              </div>
            ) : (
              <button
                className={styles.addPhotoBtn}
                onClick={() => fileRef.current?.click()}
              >
                <IcoCamera />
                <span>Add a photo</span>
              </button>
            )}
          </div>

          {/* Right: textarea */}
          <div className={styles.formTextCol}>
            <textarea
              className={styles.noteInput}
              placeholder="Write a note about this day…"
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={4}
            />
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        <button
          className={`btn btn-primary btn-full ${styles.saveBtn}`}
          onClick={handleSave}
          disabled={saving || (!note.trim() && !imageFile)}
        >
          {saving
            ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Saving…</>
            : <><IcoSave /> Save Memory</>}
        </button>
      </div>
    </div>
  )
}
