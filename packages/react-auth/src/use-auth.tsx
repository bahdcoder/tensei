import { sdk } from '@tensei/sdk'
import React, { createContext, useContext, FunctionComponent, useState, useEffect, ComponentType } from 'react'


export interface TenseiAuthContextInterface {
    isLoading: boolean
    accessToken?: string
    // @ts-ignore
    tensei: import('@tensei/sdk').SdkContract
    // @ts-ignore
    user: import('@tensei/sdk').AuthResponse['user']
    // @ts-ignore
    setAuth: (response?: import('@tensei/sdk').AuthResponse) => void

    onRedirectCallback: (path: string) => void

    loginPath: string,
    
    profilePath: string,

    Loader: ComponentType
}


const defaultOnRedirectCallback = (path: string) => {
    window.location.href = path
}

const DefaultLoader = () => <></>

export const TenseiAuthContext = createContext<TenseiAuthContextInterface>({
    isLoading: true,
    loginPath: '/auth/login',
    profilePath: '/dashboard',
    tensei: {} as any,
    user: undefined as any,
    setAuth: () => {},
    onRedirectCallback: defaultOnRedirectCallback,
    Loader: DefaultLoader
})

export const useAuth = () => useContext(TenseiAuthContext)

export const useTensei: () => TenseiAuthContextInterface['tensei'] = () => useAuth().tensei

export interface TenseiAuthProviderProps {
    tensei?: TenseiAuthContextInterface['tensei']

    // @ts-ignore
    options?: import('@tensei/sdk').SdkOptions

    onRedirectCallback?: (path: string) => void

    profilePath?: string

    loginPath?: string

    Loader?: ComponentType
}

function getUrlParameter(name: string) {
	name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]')
	var regex = new RegExp('[\\?&]' + name + '=([^&#]*)')
	var results = regex.exec(location.search)
	return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '))
}

export const TenseiAuthProvider: FunctionComponent<TenseiAuthProviderProps> = ({
    options,
    children,
    Loader = DefaultLoader,
    tensei: tenseiInstance,
    loginPath = '/auth/login',
    profilePath = '/dashboard',
    onRedirectCallback = defaultOnRedirectCallback,
}) => {
    const [accessToken, setAccessToken] = useState<string>()
    const [user, setUser] = useState<TenseiAuthContextInterface['user']>()
    const [tensei] = useState(tenseiInstance ? tenseiInstance : sdk(options))
    const [isLoading, setIsLoading] = useState<TenseiAuthContextInterface['isLoading']>(true)

    const subscribeToAuthChanges = () => {
        tensei.auth().listen((auth: any) => {
            setIsLoading(false)

            setUser(auth?.user || null)
            setAccessToken(auth?.access_token)
        })
    }

    const loadExistingSession = async () => {
        await tensei.auth().loadExistingSession()
    }

    // @ts-ignore
    const setAuth = (response?: import('@tensei/sdk').AuthResponse) => {
        setUser(response?.user || null)
        setAccessToken(response?.access_token)
    }

    const loadSocialAuth = () => {
        tensei.auth().socialConfirm()
            .then(() => {
                onRedirectCallback(profilePath)
            })
            .catch(() => {
                onRedirectCallback(loginPath)
            })
    }

    const init = async () => {
        subscribeToAuthChanges()

        // If there's an access token, then we might need to handle social authentication
        if (getUrlParameter('access_token') && getUrlParameter('provider')) {
            return loadSocialAuth()
        }

        await loadExistingSession()
    }

    useEffect(() => {
        init()
    }, [])

    return (
        <TenseiAuthContext.Provider value={{
            user,
            tensei,
            Loader,
            setAuth,
            isLoading,
            loginPath,
            profilePath,
            accessToken,
            onRedirectCallback
        }}>
            {children}
        </TenseiAuthContext.Provider>
    )
}
