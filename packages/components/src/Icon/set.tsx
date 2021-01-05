import React from 'react'

export type SupportedIcons = 'grid' | 'tag'

type GetIconParams = {
    fill: string
    width: number
    height: number
    active: boolean
    activeFill: string
}

type IconSet = {
    [key: string]: React.ReactElement
}

export default ({
    fill,
    width,
    height,
    active,
    activeFill
}: GetIconParams): IconSet => {
    const color = active ? activeFill : fill

    return {
        grid: (
            <svg
                width={width}
                height={height}
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <rect width={7} height={7} rx={1} fill={color} />
                <rect
                    opacity="0.5"
                    y={9}
                    width={7}
                    height={7}
                    rx={1}
                    fill={color}
                />
                <rect
                    opacity="0.5"
                    x={9}
                    width={7}
                    height={7}
                    rx={1}
                    fill={color}
                />
                <rect
                    opacity="0.5"
                    x={9}
                    y={9}
                    width={7}
                    height={7}
                    rx={1}
                    fill={color}
                />
            </svg>
        ),
        tag: (
            <svg
                width={width}
                height={height}
                viewBox="0 0 19 15"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path
                    opacity="0.5"
                    d="M14.5882 6.61937L8.3807 0.411916C8.11699 0.148188 7.75932 1.74901e-05 7.38636 0L1.40626 0C1.03329 0 0.675607 0.148159 0.411883 0.411883C0.148159 0.675607 0 1.03329 0 1.40626L0 7.38636C1.74901e-05 7.75932 0.148188 8.11699 0.411916 8.3807L6.61937 14.5882C6.88309 14.8519 7.24076 15 7.61371 15C7.98665 15 8.34433 14.8519 8.60805 14.5882L14.5882 8.60805C14.8519 8.34432 15 7.98665 15 7.61371C15 7.24076 14.8519 6.88309 14.5882 6.61937ZM3.28126 4.68752C3.00313 4.68752 2.73125 4.60504 2.49999 4.45052C2.26873 4.296 2.08849 4.07638 1.98205 3.81942C1.87562 3.56246 1.84777 3.2797 1.90203 3.00692C1.95629 2.73413 2.09022 2.48356 2.28689 2.28689C2.48356 2.09022 2.73413 1.95629 3.00692 1.90203C3.2797 1.84777 3.56246 1.87562 3.81942 1.98205C4.07638 2.08849 4.296 2.26873 4.45052 2.49999C4.60505 2.73125 4.68752 3.00313 4.68752 3.28126C4.68752 3.65423 4.53936 4.01191 4.27564 4.27564C4.01191 4.53936 3.65423 4.68752 3.28126 4.68752Z"
                    fill={color}
                />
                <path
                    d="M18.3381 8.60805L12.358 14.5882C12.0943 14.8519 11.7366 15 11.3637 15C10.9907 15 10.6331 14.8519 10.3693 14.5882L10.3588 14.5776L15.4582 9.47817C15.7031 9.23332 15.8973 8.94265 16.0298 8.62275C16.1623 8.30284 16.2305 7.95997 16.2305 7.61371C16.2305 7.26744 16.1623 6.92457 16.0298 6.60466C15.8973 6.28476 15.7031 5.99409 15.4582 5.74924L9.70898 0H11.1363C11.5093 1.74901e-05 11.867 0.148188 12.1307 0.411916L18.3381 6.61937C18.6018 6.88309 18.75 7.24076 18.75 7.61371C18.75 7.98665 18.6018 8.34432 18.3381 8.60805Z"
                    fill={color}
                />
            </svg>
        )
    }
}