/**
 * «Ты записан!» (макет 17.11.2026, анимация согласована «10 из 10»): итоговый лаймовый билет.
 * Билет падает на стол → по линии отрыва бежит надрез → корешок дёргают дважды и отрывают → штамп клуба ударяет,
 * билет вздрагивает, расходится кольцо краски. Классы и ключевые кадры — global.css (.cf-*); при «уменьшить движение»
 * и выключенных эффектах всё стоит на месте, корешок не отрывается.
 * Оттиск — логотип клуба WBG (путь из tools/design/frames/supporter.py); заменить на присланный владельцем оттиск.
 */
import { useId, type ReactNode } from "react";

/** Логотип клуба WBG (контур 657×~630), как в tools/design/frames/supporter.py. */
const LOGO_D = "m657.12,490.32c-.27-.21-.54-.42-.82-.63-5.79-24.13-40.41-162.06-48.37-246.64-7.78-82.62-8.95-132.1-9.91-138.22-.19-1.2-.17-6.72-1.15-7.56-26.08-22.26-81.77-66.88-114.31-97.26.76,58.63-2.69,118.48,3.5,185.35,6.52,70.43,14.63,140.56,28.78,201.38-10.66.37-29.06,1.28-52.33,2.99,16.55-5.82,33.62-15.4,41.73-22.31v-.04c-.6-1.62-1.1-3.75-1.73-6.62-15.49-70.29-24.04-133.82-28.7-194.96l-60.82,13.08,6.31,66.72,17.87-3.84,7.51,75.4c-1.75,1.52-3.99,2-6.22,2.48-19.37,4.16-42.9-22.11-49.58-99.17-7.24-83.51,12.51-115.44,43.76-124.66,12.22-3.61,28.12-2.33,37.35.23-.79-22.43-1.19-44.76-1.37-67.22-11.12-2.19-30.11-3.25-47.72.4-51.31,10.62-95.12,70.2-91.26,185.2,24.29,23.94,37,59.41,39.4,92.63,1.44,19.97.15,36.76-3.37,51.22,2.83,4.23,5.81,8.12,8.95,11.62,10.88,12.47,23.59,20.76,38.71,24.14-30.79,3.12-65.17,7.41-99.37,13.24,18.27-10.49,29.34-25.23,35.66-43.06,7.78-20.87,9.93-46.13,5.01-76.84-5.8-36.26-23.52-67.5-49.83-74.4l-.29-2.02c18.65-19.65,22.84-50.35,18.62-77.2-3.46-22.05-11.33-42.76-25.12-54.92-8.88-7.86-18.24-11.47-27.69-12.65-24.55,5.53-49.57,10.49-74.7,14.72-.67.33-1.33.66-1.96,1l33.62,344.63c-7.75,2.13-15.26,4.31-22.5,6.49l-16.28-350.95c-18.97,3.09-37.98,5.75-56.89,7.92,4.42,32.55,28.33,208.82,32.05,240.03l-.59.2c-13.11-31.86-31.86-71.73-31.86-71.73l-18.11,4.76s-6.44,48.08-10.76,79.56l-.86.3c-4.72-30.72-28.73-209.3-33.89-247.74-23.09,1.18-45.73,1.46-67.61.69,12.53,50.09,84.4,337.47,93.72,374.73.65,2.6,1,3.98,1,3.98,37.74,18.19,67.08,43.79,108.7,75.54,1.7,1.29,9.57-1.66,11.45-2.21,6.52-1.9,13.06-3.73,19.62-5.51,13.11-3.57,107.8-29.33,172.17-35.75,54.07-5.39,101.68-12.87,155.97-14.89,16.6-.62,33.22-.91,49.84-.86,8.45.02,16.9.13,25.34.33,5.58.13,10.55-.23,15.8-.74l3.51,2.59c-.04-.3-.27-1.29-.65-2.87.22-.02.43-.04.65-.07Zm-525.76-31.72c.03-14.93-.43-33.91-.35-48.44.22-7.37,2.56-48.7,2.77-55.39l.56-.2c3.2,12.24,13.5,38.46,17.11,51.74,3.55,12.27,9.63,27.22,13.43,39.74-12.65,4.45-23.9,8.71-33.52,12.55ZM245.54,122.21c2.22-1.87,5.45-2.99,9.34-3.77,12.27-2.45,20.71,12.14,23.54,33,3.15,23.2-3.12,42.61-15.82,45.11l-7.73,1.52-9.33-75.86Zm36.39,227.3c-2.97.56-5.61,1.06-8.39.44l-11.54-93.86,8.25-1.6c13.66-2.65,27.98,11.27,32.18,41.78,4.54,32.97-6.61,50.61-20.49,53.25Z";

export function ClubStamp({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className={className} width="104" height="104" viewBox="0 0 104 104" role="img" aria-label="Штамп клуба: запись подтверждена">
      <defs>
        <filter id={`${id}-rough`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves={2} seed={7} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={2.2} />
        </filter>
        <mask id={`${id}-wear`}>
          <rect width="104" height="104" fill="#fff" />
          <g fill="#000">
            <circle cx="20" cy="30" r="1.6" />
            <circle cx="78" cy="22" r="1.2" />
            <circle cx="84" cy="70" r="2" />
            <circle cx="30" cy="80" r="1.3" />
            <circle cx="60" cy="88" r="1" />
            <rect x="10" y="56" width="10" height="1.4" transform="rotate(-20 15 56)" />
            <rect x="70" y="40" width="8" height="1.2" transform="rotate(30 74 40)" />
          </g>
        </mask>
        <path id={`${id}-ring`} d="M52 52 m-40 0 a40 40 0 1 1 80 0 a40 40 0 1 1 -80 0" />
      </defs>
      <g filter={`url(#${id}-rough)`} mask={`url(#${id}-wear)`} fill="#111110" stroke="#111110">
        <circle cx="52" cy="52" r="49" fill="none" strokeWidth="3" />
        <circle cx="52" cy="52" r="32" fill="none" strokeWidth="1.6" />
        <text fontFamily="Oswald, sans-serif" fontWeight="700" fontSize="10.5" letterSpacing="1.6" stroke="none">
          <textPath href={`#${id}-ring`} startOffset="0">
            WARPHUB · ЗАПИСЬ ПОДТВЕРЖДЕНА · КЛУБ WBG ·
          </textPath>
        </text>
        <g transform="translate(33.6 36.6) scale(.056)" stroke="none">
          <path d={LOGO_D} />
        </g>
      </g>
    </svg>
  );
}

/** Итоговый билет: основа (фото, подпись, дата, факты) + штамп; корешок справа отрывается. */
export function ConfirmTicket({
  image,
  kicker,
  title,
  facts,
  stub,
}: {
  image?: string | null;
  kicker: ReactNode;
  title: ReactNode;
  facts: { label: string; value: ReactNode }[];
  stub: ReactNode;
}) {
  return (
    <div className="cf-ticket relative flex drop-shadow-[0_18px_30px_rgba(0,0,0,0.45)]">
      <div className="relative min-w-0 flex-1 overflow-hidden rounded-l-[22px] bg-accent text-[#111110]">
        {image && <img src={image} alt="" className="block h-[110px] w-full object-cover" draggable={false} />}
        <div className="px-4 pb-4 pt-3.5 pr-[92px]">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] opacity-65">{kicker}</p>
          <p className="mt-1.5 font-display text-[26px] font-bold leading-none first-letter:uppercase">{title}</p>
          <dl className="mt-3 grid grid-cols-1 gap-2.5">
            {facts.map((f) => (
              <div key={f.label} className="min-w-0">
                <dt className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] opacity-60">{f.label}</dt>
                <dd className="mt-0.5 text-[13.5px] font-extrabold">{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <span aria-hidden="true" className="cf-ink absolute right-0.5 top-[84px] size-[106px] rounded-full border-[3px] border-[#111110]" />
        <ClubStamp className="cf-stamp absolute right-[3px] top-[85px]" />
      </div>
      <div className="cf-stub relative flex w-[104px] shrink-0 flex-col items-center justify-center rounded-r-[22px] border-l-2 border-dashed border-[#111110] bg-accent px-1.5 py-3 text-center text-[#111110]">
        <span aria-hidden="true" className="cf-zip absolute -left-1.5 size-3 rounded-full bg-[#111110]" />
        {stub}
      </div>
      <span aria-hidden="true" className="pointer-events-none absolute -top-2 right-[95px] size-4 rounded-full bg-app-bg" />
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-2 right-[95px] size-4 rounded-full bg-app-bg" />
    </div>
  );
}
