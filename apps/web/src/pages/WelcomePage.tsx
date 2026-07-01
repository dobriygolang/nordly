import { LandingDownloadToast } from '@/components/landing/LandingDownloadButton'
import { LandingHero } from '@/components/landing/LandingHero'
import { LandingPhilosophy } from '@/components/landing/LandingPhilosophy'

export default function WelcomePage() {
  return (
    <>
      <LandingHero />
      <LandingPhilosophy />
      <LandingDownloadToast />
    </>
  )
}
