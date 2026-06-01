const FALLBACK = "/images/error.jpg";

export function CardImage({ src, alt, className, style, draggable, onClick }) {
  return (
    <img
      src={src || FALLBACK}
      alt={alt}
      className={className}
      style={style}
      draggable={draggable}
      onClick={onClick}
      onError={(e) => { e.target.src = FALLBACK; }}
    />
  );
}
