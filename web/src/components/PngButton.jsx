import { savePng, slug } from '../export.js'

// Small "save as PNG" button: snapshots the biggest chart or map inside the card it sits in
export default function PngButton({ name, title = 'Save this picture as a PNG' }) {
  const go = (e) => {
    const root = e.currentTarget.closest('.card, section, .map-card')
    if (root) savePng(root, slug(name)).catch((err) => console.warn(err))
  }
  return <button className="btn small png-btn" onClick={go} title={title}>⤓ PNG</button>
}
