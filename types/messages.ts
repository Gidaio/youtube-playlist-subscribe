export enum MessageType {
    Subscribe,
    Unsubscribe,
    IsSubscribed
}

export interface Message {
    type: MessageType,
    id: string
}

export interface MessageResponse {
    success: boolean,
    message?: string,
    data?: any
}