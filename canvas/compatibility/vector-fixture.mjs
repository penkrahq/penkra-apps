export const vectorCases = [
  ["square-hole", "M0 0H100V100H0Z M25 25H75V75H25Z"],
  ["curved-hole", "M50 0C116 0 116 100 50 100C-16 100 -16 0 50 0Z M50 25C83 25 83 75 50 75C17 75 17 25 50 25Z"],
  ["crossing", "M0 0L100 100L0 100L100 0Z"],
  ["polygon", "M50 0L100 35L80 100L20 100L0 35Z"],
  ["overlap", "M0 0H70V70H0Z M30 30H100V100H30Z"],
  ["quadratic", "M0 50Q25 -20 50 50T100 50L100 100H0Z"],
  ["arc", "M10 50A40 30 30 1 1 90 50A40 30 30 1 1 10 50Z"],
  ["relative", "m10 10h80v80h-80z m20 20v40h40v-40z"],
  ["offset-viewbox", "M-20 10H80V110H-20Z M5 35H55V85H5Z", [-20, 10, 100, 100]],
  ["open-fill", "M0 0L100 20L30 100"],
];
