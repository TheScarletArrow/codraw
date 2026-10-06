/**
 * Stands for the optional dependencies of jsPDF — html2canvas, DOMPurify and canvg — which the workspace does not
 * install: jsPDF loads them only for `html()` and `addSvgAsImage()`, and CoDraw calls neither.
 */
export default undefined
