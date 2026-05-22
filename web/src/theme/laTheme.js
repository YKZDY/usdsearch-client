// === LM CUSTOMIZATION: Theme ===
// LightArt 品牌主题定义
// 从 index.js 抽离，降低上游合并风险

import { extendTheme } from '@chakra-ui/react';

// LightArt-inspired dark theme color tokens
const LA = {
    primary: '#FFD230',       // Golden yellow primary
    primaryHover: '#F6C80F',  // Darker gold for hover
    primaryDim: 'rgba(246,200,15,0.15)', // Subtle gold bg
    bg: '#141517',            // Near-black background
    bgCard: '#1C1D20',       // Card background
    bgElevated: '#232428',   // Elevated surfaces (popover, dropdown)
    bgInput: '#1C1D20',      // Input background
    border: '#383838',       // Border color
    borderHover: '#FFD230',  // Border hover = gold
    text: '#FFFFFF',         // Primary text
    textSecondary: '#E5E5E5',// Secondary text
    textTertiary: '#D8D8D8', // Tertiary text
    textMuted: '#ABABAB',    // Muted text
    textDim: '#6B6B6B',      // Very dim text
    success: '#52C41A',      // Green for success
    danger: '#FF4D4F',       // Red for danger
    info: '#1890FF',         // Blue for info
    purple: '#B37FEB',       // Purple accent
    // === LM CUSTOMIZATION: status dim tokens START ===
    // 原因：success/danger/info 缺半透明态（对齐已有的 primaryDim 模式），
    //      错误/成功按钮 hover/focus 背景需要低饱和的同色调底色。
    successDim: 'rgba(82, 196, 26, 0.10)',
    dangerDim: 'rgba(255, 77, 79, 0.10)',
    infoDim: 'rgba(24, 144, 255, 0.10)',
    // === LM CUSTOMIZATION: status dim tokens END ===
};

const theme = extendTheme({
    colors: {
        brand: {
            50: '#FFF9E0',
            100: '#FFECB3',
            200: '#FFE082',
            300: '#FFD54F',
            400: '#FFD230',
            500: '#F6C80F',
            600: '#E8B800',
            700: '#C49A00',
            800: '#9C7B00',
            900: '#745C00',
        },
        gray: {
            900: LA.bg,
            800: LA.bgCard,
            700: LA.bgElevated,
            600: LA.border,
            500: '#3A3A3A',
            400: '#6B6B6B',
            300: LA.textMuted,
            200: LA.textTertiary,
            100: LA.textSecondary,
            50: LA.text,
        }
    },
    fonts: {
        heading: `'Noto Sans SC', 'NVIDIA Sans Bold', -apple-system, BlinkMacSystemFont, sans-serif`,
        body: `'Noto Sans SC', 'NVIDIA Sans', -apple-system, BlinkMacSystemFont, sans-serif`,
    },
    components: {
        Input: {
            defaultProps: {
                focusBorderColor: LA.primary,
            },
            baseStyle: {
                field: {
                    bg: LA.bgInput,
                    borderColor: LA.border,
                    _hover: { borderColor: LA.primary },
                    _focus: { borderColor: LA.primary, boxShadow: `0 0 0 1px ${LA.primary}` },
                }
            }
        },
        Select: {
            defaultProps: {
                focusBorderColor: LA.primary,
            }
        },
        Button: {
            variants: {
                solid: (props) => {
                    if (props.colorScheme === 'green' || props.colorScheme === 'brand') {
                        return {
                            bg: LA.primary,
                            color: '#000000',
                            fontWeight: '600',
                            _hover: { bg: LA.primaryHover, transform: 'translateY(-1px)', boxShadow: `0 4px 12px rgba(255,210,48,0.3)` },
                            _active: { bg: '#D4A800', transform: 'translateY(0)' },
                        };
                    }
                    return {};
                },
                outline: (props) => {
                    if (props.colorScheme === 'green' || props.colorScheme === 'brand') {
                        return {
                            borderColor: LA.primary,
                            color: LA.primary,
                            _hover: { bg: LA.primaryDim },
                        };
                    }
                    return {};
                },
                ghost: {
                    _hover: { bg: 'rgba(255,255,255,0.06)' },
                },
            }
        },
        Card: {
            baseStyle: {
                container: {
                    bg: LA.bgCard,
                    borderColor: LA.border,
                    borderWidth: '1px',
                    borderRadius: '12px',
                    transition: 'all 0.25s ease',
                    _hover: {
                        borderColor: LA.primary,
                        boxShadow: `0 0 20px rgba(255,210,48,0.08)`,
                    },
                },
            },
        },
        Modal: {
            baseStyle: {
                dialog: {
                    bg: LA.bgCard,
                    borderColor: LA.border,
                    borderWidth: '1px',
                    borderRadius: '16px',
                },
                header: {
                    color: LA.text,
                    borderBottomColor: LA.border,
                },
                closeButton: {
                    color: LA.textMuted,
                    _hover: { color: LA.text },
                },
            },
        },
        Popover: {
            baseStyle: {
                content: {
                    bg: LA.bgElevated,
                    borderColor: LA.border,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                },
                header: {
                    borderBottomColor: LA.border,
                    color: LA.text,
                },
            },
        },
        Tooltip: {
            baseStyle: {
                bg: LA.bgElevated,
                color: LA.text,
                borderRadius: '8px',
                px: 3,
                py: 2,
                fontSize: 'sm',
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            },
        },
        Switch: {
            defaultProps: {
                colorScheme: 'yellow',
            },
        },
        Badge: {
            baseStyle: {
                borderRadius: '6px',
                fontWeight: '500',
                px: 2,
                py: 0.5,
            },
        },
        Accordion: {
            baseStyle: {
                container: {
                    borderColor: LA.border,
                },
                button: {
                    _hover: { bg: 'rgba(255,255,255,0.04)' },
                },
            },
        },
        Divider: {
            baseStyle: {
                borderColor: LA.border,
            },
        },
        Table: {
            variants: {
                simple: {
                    th: {
                        borderColor: LA.border,
                        color: LA.textMuted,
                    },
                    td: {
                        borderColor: LA.border,
                    },
                },
            },
        },
    },
    shadows: {outline: `0 0 0 3px rgba(255,210,48,0.4)`},
    config: {
        initialColorMode: 'dark',
        useSystemColorMode: false,
    },
    styles: {
        global: (props) => ({
            body: {
                fontFamily: 'body',
                color: LA.text,
                bg: LA.bg,
                lineHeight: 'base',
            },
            // Custom scrollbar styling
            '::-webkit-scrollbar': {
                width: '6px',
                height: '6px',
            },
            '::-webkit-scrollbar-track': {
                bg: 'transparent',
            },
            '::-webkit-scrollbar-thumb': {
                bg: LA.border,
                borderRadius: '3px',
                _hover: { bg: '#555' },
            },
            // Selection color
            '::selection': {
                bg: 'rgba(255,210,48,0.3)',
                color: LA.text,
            },
        }),
    },
});

export default theme;
export { LA };
