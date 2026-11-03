import {
  Briefcase,
  Car,
  Check,
  Coffee,
  CookingPot,
  Dumbbell,
  Flame,
  Landmark,
  Mountain,
  Plane,
  Sparkles,
  Sunset,
  Umbrella,
  UtensilsCrossed,
  Waves,
  Wifi,
  Wine,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  수영장: Waves,
  주차장: Car,
  와이파이: Wifi,
  조식포함: Coffee,
  스파: Sparkles,
  바베큐: Flame,
  레스토랑: UtensilsCrossed,
  바: Wine,
  피트니스센터: Dumbbell,
  바다뷰: Sunset,
  해변: Umbrella,
  공항셔틀: Plane,
  비즈니스센터: Briefcase,
  한옥체험: Landmark,
  문화체험: Landmark,
  등산로: Mountain,
  취사가능: CookingPot,
};

export function AmenityIcon({ name, size = 18 }: { name: string; size?: number }) {
  const Icon = ICONS[name] ?? Check;
  return <Icon size={size} aria-hidden />;
}
