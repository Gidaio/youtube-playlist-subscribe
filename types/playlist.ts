export interface StoredPlaylist {
    title: string,
    itemCount: number,
    readItemCount: number
}

export interface Playlist {
    kind: "youtube#playlist",
    etag: string,
    id: string,
    snippet: {
      title: string
    },
    contentDetails: {
      itemCount: number
    }
}

export interface PlaylistResponse {
    kind: "youtube#playlistListResponse",
    etag: string,
    nextPageToken: string,
    prevPageToken: string,
    pageInfo: {
      totalResults: number,
      resultsPerPage: number
    },
    items: Playlist[]
}
