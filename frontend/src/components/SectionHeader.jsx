function SectionHeader({ eyebrow, title, description }) {
  return (
    <div className="mb-8">
      {eyebrow ? <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-orange-300">{eyebrow}</p> : null}
      <h2 className="text-3xl font-bold text-white md:text-4xl">{title}</h2>
      {description ? <p className="mt-3 max-w-2xl text-base text-slate-300">{description}</p> : null}
    </div>
  );
}

export default SectionHeader;
