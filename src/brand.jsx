import React from "react";

export const B = {
  dark:       "#001520",
  darkMid:    "#002235",
  darkLight:  "#e8f0f4",
  darkBorder: "#b0c8d4",
  red:        "#c70b07",
  redLight:   "#fef2f2",
  redBorder:  "#fca5a5",
  white:      "#ffffff",
};

export const LOGO_SRC = "/adforce-logo.png";

/**
 * Portrait-friendly logo — use `boxWidth` + `boxHeight` for hero areas, or `height` for compact headers.
 */
export function AdforceLogo({ height, width, maxHeight, boxWidth, boxHeight, align = "left", className = "" }) {
  const objectPosition = align === "center" ? "center center" : "left center";
  const imgStyle = {
    background: "transparent",
    objectFit: "contain",
    objectPosition,
    display: "block",
    maxWidth: "100%",
    maxHeight: "100%",
    width: "auto",
    height: "auto",
  };

  if (boxWidth != null && boxHeight != null) {
    return (
      <div
        className={className}
        style={{
          width: boxWidth,
          height: boxHeight,
          display: "flex",
          alignItems: "center",
          justifyContent: align === "center" ? "center" : "flex-start",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        <img src={LOGO_SRC} alt="Adforce Solutions" style={imgStyle} draggable={false} className="select-none" />
      </div>
    );
  }

  const style = { ...imgStyle, flexShrink: 0 };
  if (width != null) {
    style.width = width;
    if (maxHeight != null) style.maxHeight = maxHeight;
  } else {
    style.height = height ?? 40;
    if (maxHeight != null) style.maxHeight = maxHeight;
  }

  return (
    <img
      src={LOGO_SRC}
      alt="Adforce Solutions"
      className={`select-none ${className}`}
      style={style}
      draggable={false}
    />
  );
}
