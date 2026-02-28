import { useEffect } from 'react'
import type { GalleryScreenProps } from '../types/app.types'

// GalleryScreen - 더 이상 사용하지 않음 (safeGoGallery에서 바로 ImagePicker 실행)
// 만약 이 화면에 도달하면 홈으로 리다이렉트
const GalleryScreen = ({ safeGoHome }: GalleryScreenProps) => {
  useEffect(() => {
    safeGoHome()
  }, [safeGoHome])

  return null
}

export default GalleryScreen
