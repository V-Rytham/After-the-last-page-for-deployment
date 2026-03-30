import React from 'react';

const PageRenderer = ({
  viewportRef,
  html,
  pageTurnDirection,
  style,
}) => (
  <div
    ref={viewportRef}
    className="reader-page-viewport"
  >
    <main
      className={`reading-column reader-content-wrapper font-serif ${pageTurnDirection ? `is-turning is-turning-${pageTurnDirection}` : ''}`}
      style={style}
      lang="en"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  </div>
);

export default PageRenderer;
