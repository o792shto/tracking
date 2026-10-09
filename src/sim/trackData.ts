// このファイルは scripts/import-tracks.mjs が docs/reference/jra-tracks/courses_geometry.json から生成する。手で直さないこと。
// 形状はユーザー提供の推定モデル（1周・直線などの公式値は満たすが、コーナー半径・分岐位置・引き込み線は推定）。
// 詳しくは docs/reference/jra-tracks/jra_track_spec.md を参照。
import type { TrackData } from './trackTypes';

export const TRACK_DATA: TrackData = {
  "東京": {
    "direction": "left",
    "layouts": {
      "turf": {
        "surface": "turf",
        "length": 2083.1,
        "start": {
          "x": 0,
          "y": 0,
          "headingDeg": 0
        },
        "segments": [
          [33, 0],
          [441.3, 176.002],
          [558.9, 0],
          [524, 183.998],
          [525.9, 0]
        ],
        "elevation": [
          [0, 2.7],
          [33, 2.7],
          [754, 0.8],
          [860, 0.8],
          [1000, 2.3],
          [1060, 2.3],
          [1420, 0],
          [1557.2, 0.4],
          [1603.1, 0.7],
          [1823.1, 2.7],
          [2083.1, 2.7]
        ]
      },
      "dirt": {
        "surface": "dirt",
        "length": 1899,
        "start": {
          "x": 0,
          "y": 32,
          "headingDeg": 0
        },
        "segments": [
          [39, 0],
          [359.4, 174.887],
          [540.6, 0],
          [458.4, 185.113],
          [501.6, 0]
        ],
        "elevation": [
          [0, 2.5],
          [39, 2.5],
          [668, 0.7],
          [760, 0.7],
          [900, 2.1],
          [960, 2.1],
          [1250, 0],
          [1449, 0.1],
          [1699, 2.5],
          [1899, 2.5]
        ]
      }
    },
    "chutes": {
      "chute_t18": {
        "layout": "turf",
        "joinXY": [73.7, 281.4],
        "headingDeg": 163.6,
        "length": 180,
        "usedBy": [
          "turf 1800m"
        ]
      },
      "chute_t20": {
        "layout": "turf",
        "joinXY": [157.2, 71.5],
        "headingDeg": 59.9,
        "length": 120,
        "usedBy": [
          "turf 2000m"
        ]
      },
      "chute_d16": {
        "layout": "dirt",
        "joinXY": [49.5, 267],
        "headingDeg": 174.9,
        "length": 119.4,
        "usedBy": [
          "dirt 1600m"
        ]
      }
    },
    "starts": [
      {
        "surface": "turf",
        "distance": 1400,
        "layout": "turf",
        "firstLayout": "turf",
        "firstS": 683.1,
        "laps": 0
      },
      {
        "surface": "turf",
        "distance": 1600,
        "layout": "turf",
        "firstLayout": "turf",
        "firstS": 483.1,
        "laps": 0
      },
      {
        "surface": "turf",
        "distance": 1800,
        "layout": "turf",
        "firstLayout": "turf",
        "firstS": 443.05,
        "chute": "chute_t18",
        "chuteBack": 160,
        "laps": 0
      },
      {
        "surface": "turf",
        "distance": 2000,
        "layout": "turf",
        "firstLayout": "turf",
        "firstS": 183.05,
        "chute": "chute_t20",
        "chuteBack": 100,
        "laps": 0
      },
      {
        "surface": "turf",
        "distance": 2300,
        "layout": "turf",
        "firstLayout": "turf",
        "firstS": 1866.2,
        "laps": 1
      },
      {
        "surface": "turf",
        "distance": 2400,
        "layout": "turf",
        "firstLayout": "turf",
        "firstS": 1766.2,
        "laps": 1
      },
      {
        "surface": "turf",
        "distance": 2500,
        "layout": "turf",
        "firstLayout": "turf",
        "firstS": 1666.2,
        "laps": 1
      },
      {
        "surface": "turf",
        "distance": 2600,
        "layout": "turf",
        "firstLayout": "turf",
        "firstS": 1566.2,
        "laps": 1
      },
      {
        "surface": "turf",
        "distance": 3400,
        "layout": "turf",
        "firstLayout": "turf",
        "firstS": 766.2,
        "laps": 1
      },
      {
        "surface": "dirt",
        "distance": 1300,
        "layout": "dirt",
        "firstLayout": "dirt",
        "firstS": 599,
        "laps": 0
      },
      {
        "surface": "dirt",
        "distance": 1400,
        "layout": "dirt",
        "firstLayout": "dirt",
        "firstS": 499,
        "laps": 0
      },
      {
        "surface": "dirt",
        "distance": 1600,
        "layout": "dirt",
        "firstLayout": "dirt",
        "firstS": 398.4,
        "chute": "chute_d16",
        "chuteBack": 99.4,
        "laps": 0
      },
      {
        "surface": "dirt",
        "distance": 2100,
        "layout": "dirt",
        "firstLayout": "dirt",
        "firstS": 1698,
        "laps": 1
      },
      {
        "surface": "dirt",
        "distance": 2400,
        "layout": "dirt",
        "firstLayout": "dirt",
        "firstS": 1398,
        "laps": 1
      },
      {
        "surface": "dirt",
        "distance": 1200,
        "layout": "dirt",
        "firstLayout": "dirt",
        "firstS": 699,
        "laps": 0
      }
    ]
  },
  "中山": {
    "direction": "right",
    "layouts": {
      "turf_inner": {
        "surface": "turf",
        "length": 1667.1,
        "start": {
          "x": 0,
          "y": 0,
          "headingDeg": 180
        },
        "segments": [
          [70, 0],
          [453.5, -179.994],
          [380, 0],
          [453.6, -180.006],
          [310, 0]
        ],
        "elevation": [
          [0, 2.2],
          [296.8, 5.3],
          [523.6, 4.4],
          [713, 2.4],
          [903.6, 2.2],
          [1130, 2],
          [1357.1, 0.6],
          [1487.1, 0],
          [1597.1, 2.2],
          [1667.1, 2.2]
        ]
      },
      "turf_outer": {
        "surface": "turf",
        "length": 1839.7,
        "start": {
          "x": 0,
          "y": 0,
          "headingDeg": 180
        },
        "segments": [
          [70, 0],
          [368, -146.059078],
          [34.69, -8.379],
          [301.14, 0],
          [642.63, -160.621],
          [113.2, -44.922132],
          [310, 0]
        ],
        "elevation": [
          [0, 2.2],
          [296.8, 5.3],
          [438, 4.74],
          [472.7, 4.2],
          [773.8, 2.2],
          [1416.5, 1.298],
          [1529.7, 0.6],
          [1659.7, 0],
          [1769.7, 2.2],
          [1839.7, 2.2]
        ]
      },
      "dirt": {
        "surface": "dirt",
        "length": 1493,
        "start": {
          "x": 0,
          "y": 26,
          "headingDeg": 180
        },
        "segments": [
          [68, 0],
          [351, -177.296],
          [376, 0],
          [390, -182.704],
          [308, 0]
        ],
        "elevation": [
          [0, 2],
          [250, 4.5],
          [419, 3.8],
          [607, 2],
          [795, 1.8],
          [1185, 0.5],
          [1293, 0],
          [1413, 2],
          [1493, 2]
        ]
      }
    },
    "chutes": {
      "chute_t16": {
        "layout": "turf_outer",
        "joinXY": [-150.6, 264.1],
        "headingDeg": 33.9,
        "length": 218.3,
        "usedBy": [
          "turf_outer 1600m"
        ]
      },
      "chute_t4c": {
        "layout": "turf_inner",
        "joinXY": [310, 0],
        "headingDeg": 180,
        "length": 70.3,
        "usedBy": [
          "turf_inner 2000m",
          "turf_outer 2200m",
          "turf_outer 4000m"
        ]
      },
      "chute_d12": {
        "layout": "dirt",
        "joinXY": [-73.4, 252.7],
        "headingDeg": 2.7,
        "length": 146,
        "usedBy": [
          "dirt 1200m"
        ]
      }
    },
    "starts": [
      {
        "surface": "turf",
        "distance": 1200,
        "layout": "turf_outer",
        "firstLayout": "turf_outer",
        "firstS": 639.7,
        "laps": 0
      },
      {
        "surface": "turf",
        "distance": 1600,
        "layout": "turf_outer",
        "firstLayout": "turf_outer",
        "firstS": 438,
        "chute": "chute_t16",
        "chuteBack": 198.3,
        "laps": 0
      },
      {
        "surface": "turf",
        "distance": 1800,
        "layout": "turf_inner",
        "firstLayout": "turf_inner",
        "firstS": 1534.2,
        "laps": 1
      },
      {
        "surface": "turf",
        "distance": 2000,
        "layout": "turf_inner",
        "firstLayout": "turf_inner",
        "firstS": 1357.1,
        "chute": "chute_t4c",
        "chuteBack": 22.9,
        "laps": 1
      },
      {
        "surface": "turf",
        "distance": 2200,
        "layout": "turf_outer",
        "firstLayout": "turf_outer",
        "firstS": 1529.7,
        "chute": "chute_t4c",
        "chuteBack": 50.3,
        "laps": 1
      },
      {
        "surface": "turf",
        "distance": 2500,
        "layout": "turf_inner",
        "firstLayout": "turf_outer",
        "firstS": 1006.8,
        "laps": 1
      },
      {
        "surface": "turf",
        "distance": 2600,
        "layout": "turf_outer",
        "firstLayout": "turf_outer",
        "firstS": 1079.4,
        "laps": 1
      },
      {
        "surface": "turf",
        "distance": 3600,
        "layout": "turf_inner",
        "firstLayout": "turf_inner",
        "firstS": 1401.3,
        "laps": 2
      },
      {
        "surface": "turf",
        "distance": 4000,
        "layout": "turf_outer",
        "firstLayout": "turf_outer",
        "firstS": 1529.7,
        "chute": "chute_t4c",
        "chuteBack": 10.6,
        "laps": 2
      },
      {
        "surface": "turf",
        "distance": 3200,
        "layout": "turf_inner",
        "firstLayout": "turf_outer",
        "firstS": 306.8,
        "laps": 1
      },
      {
        "surface": "dirt",
        "distance": 1000,
        "layout": "dirt",
        "firstLayout": "dirt",
        "firstS": 493,
        "laps": 0
      },
      {
        "surface": "dirt",
        "distance": 1200,
        "layout": "dirt",
        "firstLayout": "dirt",
        "firstS": 418.95,
        "chute": "chute_d12",
        "chuteBack": 126,
        "laps": 0
      },
      {
        "surface": "dirt",
        "distance": 1700,
        "layout": "dirt",
        "firstLayout": "dirt",
        "firstS": 1286,
        "laps": 1
      },
      {
        "surface": "dirt",
        "distance": 1800,
        "layout": "dirt",
        "firstLayout": "dirt",
        "firstS": 1186,
        "laps": 1
      },
      {
        "surface": "dirt",
        "distance": 2400,
        "layout": "dirt",
        "firstLayout": "dirt",
        "firstS": 586,
        "laps": 1
      },
      {
        "surface": "dirt",
        "distance": 2500,
        "layout": "dirt",
        "firstLayout": "dirt",
        "firstS": 486,
        "laps": 1
      }
    ]
  },
  "京都": {
    "direction": "right",
    "layouts": {
      "turf_outer": {
        "surface": "turf",
        "length": 1894.3,
        "start": {
          "x": 0,
          "y": 0,
          "headingDeg": 180
        },
        "segments": [
          [91, 0],
          [428.3, -177.402],
          [494.7, 0],
          [476.6, -182.598],
          [403.7, 0]
        ],
        "elevation": [
          [0, 0],
          [760, 0],
          [1094.3, 4.3],
          [1274.3, 0],
          [1894.3, 0]
        ]
      },
      "turf_inner": {
        "surface": "turf",
        "length": 1782.8,
        "start": {
          "x": 0,
          "y": 0,
          "headingDeg": 180
        },
        "segments": [
          [91, 0],
          [428.3, -177.402],
          [445, 0],
          [398.68, -156.97],
          [91.42, -25.628],
          [328.4, 0]
        ],
        "elevation": [
          [0, 0],
          [760, 0],
          [964.3, 2.628],
          [1000, 3.1],
          [1200, 0],
          [1782.8, 0]
        ]
      },
      "dirt": {
        "surface": "dirt",
        "length": 1607.6,
        "start": {
          "x": 0,
          "y": 30,
          "headingDeg": 180
        },
        "segments": [
          [91, 0],
          [359.02, -176.873],
          [420.1, 0],
          [408.38, -183.127],
          [329.1, 0]
        ],
        "elevation": [
          [0, 0],
          [600, 0],
          [830, 3],
          [1000, 0],
          [1607.6, 0]
        ]
      }
    },
    "chutes": {
      "chute_t2c": {
        "layout": "turf_outer",
        "joinXY": [-97.3, 276.5],
        "headingDeg": 2.6,
        "length": 445,
        "usedBy": [
          "turf_inner 1400m",
          "turf_outer 1400m",
          "turf_inner 1600m",
          "turf_outer 1600m",
          "turf_outer 1800m"
        ]
      },
      "chute_t4c": {
        "layout": "turf_outer",
        "joinXY": [403.7, 0],
        "headingDeg": 180,
        "length": 122,
        "usedBy": [
          "turf_outer 2400m"
        ]
      },
      "chute_d14": {
        "layout": "dirt",
        "joinXY": [-97.3, 262.4],
        "headingDeg": 3.1,
        "length": 262.4,
        "usedBy": [
          "dirt 1200m",
          "dirt 1400m"
        ]
      }
    },
    "starts": [
      {
        "surface": "turf",
        "distance": 1100,
        "layout": "turf_inner",
        "firstLayout": "turf_inner",
        "firstS": 682.8,
        "laps": 0
      },
      {
        "surface": "turf",
        "distance": 1200,
        "layout": "turf_inner",
        "firstLayout": "turf_inner",
        "firstS": 582.8,
        "laps": 0
      },
      {
        "surface": "turf",
        "distance": 1400,
        "layout": "turf_inner",
        "firstLayout": "turf_inner",
        "firstS": 519.25,
        "chute": "chute_t2c",
        "chuteBack": 136.5,
        "laps": 0
      },
      {
        "surface": "turf",
        "distance": 1400,
        "layout": "turf_outer",
        "firstLayout": "turf_outer",
        "firstS": 519.25,
        "chute": "chute_t2c",
        "chuteBack": 25,
        "laps": 0
      },
      {
        "surface": "turf",
        "distance": 1600,
        "layout": "turf_inner",
        "firstLayout": "turf_inner",
        "firstS": 519.25,
        "chute": "chute_t2c",
        "chuteBack": 336.5,
        "laps": 0
      },
      {
        "surface": "turf",
        "distance": 1600,
        "layout": "turf_outer",
        "firstLayout": "turf_outer",
        "firstS": 519.25,
        "chute": "chute_t2c",
        "chuteBack": 225,
        "laps": 0
      },
      {
        "surface": "turf",
        "distance": 1800,
        "layout": "turf_outer",
        "firstLayout": "turf_outer",
        "firstS": 519.25,
        "chute": "chute_t2c",
        "chuteBack": 425,
        "laps": 0
      },
      {
        "surface": "turf",
        "distance": 2000,
        "layout": "turf_inner",
        "firstLayout": "turf_inner",
        "firstS": 1565.6,
        "laps": 1
      },
      {
        "surface": "turf",
        "distance": 2000,
        "layout": "turf_outer",
        "firstLayout": "turf_outer",
        "firstS": 1788.6,
        "laps": 1
      },
      {
        "surface": "turf",
        "distance": 2200,
        "layout": "turf_outer",
        "firstLayout": "turf_outer",
        "firstS": 1588.6,
        "laps": 1
      },
      {
        "surface": "turf",
        "distance": 2400,
        "layout": "turf_outer",
        "firstLayout": "turf_outer",
        "firstS": 1490.6,
        "chute": "chute_t4c",
        "chuteBack": 102,
        "laps": 1
      },
      {
        "surface": "turf",
        "distance": 3000,
        "layout": "turf_outer",
        "firstLayout": "turf_outer",
        "firstS": 788.6,
        "laps": 1
      },
      {
        "surface": "turf",
        "distance": 3200,
        "layout": "turf_outer",
        "firstLayout": "turf_outer",
        "firstS": 588.6,
        "laps": 1
      },
      {
        "surface": "dirt",
        "distance": 1000,
        "layout": "dirt",
        "firstLayout": "dirt",
        "firstS": 607.6,
        "laps": 0
      },
      {
        "surface": "dirt",
        "distance": 1100,
        "layout": "dirt",
        "firstLayout": "dirt",
        "firstS": 507.6,
        "laps": 0
      },
      {
        "surface": "dirt",
        "distance": 1200,
        "layout": "dirt",
        "firstLayout": "dirt",
        "firstS": 450.05,
        "chute": "chute_d14",
        "chuteBack": 42.4,
        "laps": 0
      },
      {
        "surface": "dirt",
        "distance": 1400,
        "layout": "dirt",
        "firstLayout": "dirt",
        "firstS": 450.05,
        "chute": "chute_d14",
        "chuteBack": 242.4,
        "laps": 0
      },
      {
        "surface": "dirt",
        "distance": 1800,
        "layout": "dirt",
        "firstLayout": "dirt",
        "firstS": 1415.2,
        "laps": 1
      },
      {
        "surface": "dirt",
        "distance": 1900,
        "layout": "dirt",
        "firstLayout": "dirt",
        "firstS": 1315.2,
        "laps": 1
      },
      {
        "surface": "dirt",
        "distance": 2600,
        "layout": "dirt",
        "firstLayout": "dirt",
        "firstS": 615.2,
        "laps": 1
      }
    ]
  },
  "阪神": {
    "direction": "right",
    "layouts": {
      "turf_outer": {
        "surface": "turf",
        "length": 2089,
        "start": {
          "x": 0,
          "y": 0,
          "headingDeg": 180
        },
        "segments": [
          [18, 0],
          [434.4, -167.914],
          [491.6, 0],
          [671.4, -192.086],
          [473.6, 0]
        ],
        "elevation": [
          [0, 1.8],
          [760, 1.8],
          [944, 2.4],
          [1489, 2.3],
          [1889, 0],
          [2009, 1.8],
          [2089, 1.8]
        ]
      },
      "turf_inner": {
        "surface": "turf",
        "length": 1689,
        "start": {
          "x": 0,
          "y": 0,
          "headingDeg": 180
        },
        "segments": [
          [18, 0],
          [434.4, -167.914],
          [283.8, 0],
          [422.36, -113.806],
          [173.94, -78.266501],
          [356.5, 0]
        ],
        "elevation": [
          [0, 1.8],
          [736.2, 1.8],
          [889, 1.9],
          [1489, 0],
          [1609, 1.8],
          [1689, 1.8]
        ]
      },
      "dirt": {
        "surface": "dirt",
        "length": 1517.6,
        "start": {
          "x": 0,
          "y": 28,
          "headingDeg": 180
        },
        "segments": [
          [21, 0],
          [265.3, -163.486],
          [373.7, 0],
          [504.9, -196.514],
          [352.7, 0]
        ],
        "elevation": [
          [0, 1.6],
          [617.6, 1.6],
          [1317.6, 0],
          [1437.6, 1.6],
          [1517.6, 1.6]
        ]
      }
    },
    "chutes": {
      "chute_t2c": {
        "layout": "turf_outer",
        "joinXY": [-49, 293.2],
        "headingDeg": 12.1,
        "length": 183.4,
        "usedBy": [
          "turf_inner 1400m",
          "turf_outer 1800m",
          "turf_inner 3000m"
        ]
      },
      "chute_t4c": {
        "layout": "turf_outer",
        "joinXY": [473.6, 0],
        "headingDeg": 180,
        "length": 57.4,
        "usedBy": [
          "turf_inner 2200m",
          "turf_outer 2600m"
        ]
      },
      "chute_d14": {
        "layout": "dirt",
        "joinXY": [-47.4, 210.1],
        "headingDeg": 16.5,
        "length": 188.7,
        "usedBy": [
          "dirt 1400m"
        ]
      },
      "chute_d20": {
        "layout": "dirt",
        "joinXY": [352.7, 28],
        "headingDeg": 180,
        "length": 149.7,
        "usedBy": [
          "dirt 2000m"
        ]
      }
    },
    "starts": [
      {
        "surface": "turf",
        "distance": 1200,
        "layout": "turf_inner",
        "firstLayout": "turf_inner",
        "firstS": 489,
        "laps": 0
      },
      {
        "surface": "turf",
        "distance": 1400,
        "layout": "turf_inner",
        "firstLayout": "turf_inner",
        "firstS": 452.45,
        "chute": "chute_t2c",
        "chuteBack": 163.4,
        "laps": 0
      },
      {
        "surface": "turf",
        "distance": 1400,
        "layout": "turf_outer",
        "firstLayout": "turf_outer",
        "firstS": 689,
        "laps": 0
      },
      {
        "surface": "turf",
        "distance": 1600,
        "layout": "turf_outer",
        "firstLayout": "turf_outer",
        "firstS": 489,
        "laps": 0
      },
      {
        "surface": "turf",
        "distance": 1800,
        "layout": "turf_outer",
        "firstLayout": "turf_outer",
        "firstS": 452.45,
        "chute": "chute_t2c",
        "chuteBack": 163.4,
        "laps": 0
      },
      {
        "surface": "turf",
        "distance": 2000,
        "layout": "turf_inner",
        "firstLayout": "turf_inner",
        "firstS": 1378,
        "laps": 1
      },
      {
        "surface": "turf",
        "distance": 2200,
        "layout": "turf_inner",
        "firstLayout": "turf_outer",
        "firstS": 1615.4,
        "chute": "chute_t4c",
        "chuteBack": 37.4,
        "laps": 1
      },
      {
        "surface": "turf",
        "distance": 2400,
        "layout": "turf_outer",
        "firstLayout": "turf_outer",
        "firstS": 1778,
        "laps": 1
      },
      {
        "surface": "turf",
        "distance": 2600,
        "layout": "turf_outer",
        "firstLayout": "turf_outer",
        "firstS": 1615.4,
        "chute": "chute_t4c",
        "chuteBack": 37.4,
        "laps": 1
      },
      {
        "surface": "turf",
        "distance": 3000,
        "layout": "turf_inner",
        "firstLayout": "turf_inner",
        "firstS": 452.45,
        "chute": "chute_t2c",
        "chuteBack": 74.4,
        "laps": 1
      },
      {
        "surface": "turf",
        "distance": 3200,
        "layout": "turf_inner",
        "firstLayout": "turf_outer",
        "firstS": 578,
        "laps": 1
      },
      {
        "surface": "dirt",
        "distance": 1200,
        "layout": "dirt",
        "firstLayout": "dirt",
        "firstS": 317.6,
        "laps": 0
      },
      {
        "surface": "dirt",
        "distance": 1400,
        "layout": "dirt",
        "firstLayout": "dirt",
        "firstS": 286.3,
        "chute": "chute_d14",
        "chuteBack": 168.7,
        "laps": 0
      },
      {
        "surface": "dirt",
        "distance": 1800,
        "layout": "dirt",
        "firstLayout": "dirt",
        "firstS": 1235.2,
        "laps": 1
      },
      {
        "surface": "dirt",
        "distance": 2000,
        "layout": "dirt",
        "firstLayout": "dirt",
        "firstS": 1164.9,
        "chute": "chute_d20",
        "chuteBack": 129.7,
        "laps": 1
      },
      {
        "surface": "dirt",
        "distance": 2600,
        "layout": "dirt",
        "firstLayout": "dirt",
        "firstS": 435.2,
        "laps": 1
      }
    ]
  }
};
