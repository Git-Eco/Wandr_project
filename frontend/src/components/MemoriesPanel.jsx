import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { getDayMemories, saveMemory, deleteMemory } from '../api/client'
import styles from './MemoriesPanel.module.css'

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
    // 5MB limit
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

      // Upload image to Supabase Storage if provided
      if (imageFile) {
        const { data: { user } } = await supabase.auth.getUser()
        const ext  = imageFile.name.split('.').pop()
        const path = `${user.id}/${tripId}/day${dayNum}-${Date.now()}.${ext}`

        const { error: uploadErr } = await supabase.storage
          .from('memories')
          .upload(path, imageFile, { upsert: false })

        if (uploadErr) throw uploadErr

        const { data: urlData } = supabase.storage
          .from('memories')
          .getPublicUrl(path)  // won't work for private — use signed URL

        // For private bucket, get a signed URL (1 year expiry)
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
      <h4 className={styles.heading}>📸 Memories — Day {dayNum}</h4>

      {/* ── Saved memories ── */}
      {loading ? (
        <div className={styles.loadingRow}>
          <div className="spinner" style={{ width: 20, height: 20 }} />
        </div>
      ) : memories.length === 0 ? (
        <div className={styles.empty}>No memories yet for this day. Add one below!</div>
      ) : (
        <div className={styles.memoryList}>
          {memories.map(m => (
            <div key={m.id} className={styles.memoryCard}>
              {m.image_url && (
                <img
                  src={m.image_url}
                  alt="Memory"
                  className={styles.memoryImg}
                  onClick={() => window.open(m.image_url, '_blank')}
                />
              )}
              {m.note && <p className={styles.memoryNote}>{m.note}</p>}
              <div className={styles.memoryFooter}>
                <span className={styles.memoryDate}>
                  {new Date(m.created_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric'
                  })}
                </span>
                <button
                  className={styles.deleteBtn}
                  onClick={() => handleDelete(m)}
                  disabled={deletingId === m.id}
                >
                  {deletingId === m.id ? '…' : '🗑'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add memory form ── */}
      <div className={styles.form}>
        <textarea
          className={styles.noteInput}
          placeholder="Write a note about this day…"
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={3}
        />

        {/* Image picker */}
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
            📷 Add a photo
          </button>
        )}

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
            : '💾 Save Memory'}
        </button>
      </div>
    </div>
  )
}
