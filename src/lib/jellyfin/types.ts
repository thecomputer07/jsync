// Sottoinsieme dei DTO Jellyfin (10.9+) che l'app usa davvero.

export type ItemKind =
  | 'Movie'
  | 'Series'
  | 'Season'
  | 'Episode'
  | 'CollectionFolder'
  | 'BoxSet'
  | 'Folder'
  | 'Video'
  | string;

export interface UserData {
  PlaybackPositionTicks?: number;
  PlayedPercentage?: number;
  Played?: boolean;
  IsFavorite?: boolean;
  UnplayedItemCount?: number;
}

export interface MediaStream {
  Index: number;
  Type: 'Video' | 'Audio' | 'Subtitle' | 'EmbeddedImage' | string;
  Codec?: string;
  Language?: string;
  DisplayTitle?: string;
  Title?: string;
  IsDefault?: boolean;
  IsForced?: boolean;
  IsExternal?: boolean;
  IsTextSubtitleStream?: boolean;
  DeliveryMethod?: 'Encode' | 'Embed' | 'External' | 'Hls' | 'Drop';
  DeliveryUrl?: string;
}

export interface MediaSource {
  Id: string;
  Container?: string;
  RunTimeTicks?: number;
  SupportsDirectPlay?: boolean;
  SupportsDirectStream?: boolean;
  SupportsTranscoding?: boolean;
  TranscodingUrl?: string;
  TranscodingSubProtocol?: string;
  MediaStreams?: MediaStream[];
  DefaultAudioStreamIndex?: number;
  DefaultSubtitleStreamIndex?: number;
}

export interface BaseItem {
  Id: string;
  Name: string;
  Type: ItemKind;
  ServerId?: string;
  Overview?: string;
  ProductionYear?: number;
  PremiereDate?: string;
  OfficialRating?: string;
  CommunityRating?: number;
  RunTimeTicks?: number;
  Genres?: string[];
  CollectionType?: string;
  IsFolder?: boolean;
  ChildCount?: number;
  SeriesId?: string;
  SeriesName?: string;
  SeasonId?: string;
  SeasonName?: string;
  IndexNumber?: number;
  ParentIndexNumber?: number;
  ParentId?: string;
  ImageTags?: Record<string, string>;
  BackdropImageTags?: string[];
  ParentBackdropItemId?: string;
  ParentBackdropImageTags?: string[];
  ParentThumbItemId?: string;
  ParentThumbImageTag?: string;
  ParentLogoItemId?: string;
  ParentLogoImageTag?: string;
  SeriesPrimaryImageTag?: string;
  PrimaryImageAspectRatio?: number;
  UserData?: UserData;
  MediaSources?: MediaSource[];
  MediaStreams?: MediaStream[];
}

export interface ItemsResult {
  Items: BaseItem[];
  TotalRecordCount: number;
  StartIndex?: number;
}

export interface PublicSystemInfo {
  ServerName: string;
  Version: string;
  Id: string;
  LocalAddress?: string;
  StartupWizardCompleted?: boolean;
}

export interface UserDto {
  Id: string;
  Name: string;
  ServerId?: string;
  PrimaryImageTag?: string;
  Policy?: { IsAdministrator?: boolean; SyncPlayAccess?: 'CreateAndJoinGroups' | 'JoinGroups' | 'None' };
}

export interface AuthResult {
  User: UserDto;
  AccessToken: string;
  ServerId: string;
}

export interface PlaybackInfoResponse {
  MediaSources: MediaSource[];
  PlaySessionId: string;
  ErrorCode?: string;
}

export type SegmentType = 'Unknown' | 'Commercial' | 'Preview' | 'Recap' | 'Outro' | 'Intro';

export interface MediaSegment {
  Id?: string;
  ItemId?: string;
  Type: SegmentType;
  StartTicks: number;
  EndTicks: number;
}

// ── SyncPlay ──

export type GroupState = 'Idle' | 'Waiting' | 'Paused' | 'Playing';

export interface GroupInfo {
  GroupId: string;
  GroupName: string;
  State: GroupState;
  Participants: string[];
  LastUpdatedAt: string;
}

export interface QueueItem {
  ItemId: string;
  PlaylistItemId: string;
}

export interface PlayQueueUpdate {
  Reason:
    | 'NewPlaylist'
    | 'SetCurrentItem'
    | 'RemoveItems'
    | 'MoveItem'
    | 'Queue'
    | 'QueueNext'
    | 'NextItem'
    | 'PreviousItem'
    | 'RepeatMode'
    | 'ShuffleMode';
  LastUpdate: string;
  Playlist: QueueItem[];
  PlayingItemIndex: number;
  StartPositionTicks: number;
  IsPlaying: boolean;
  ShuffleMode?: string;
  RepeatMode?: string;
}

export type SendCommandType = 'Unpause' | 'Pause' | 'Stop' | 'Seek';

export interface SyncPlayCommand {
  GroupId: string;
  PlaylistItemId: string;
  When: string;
  PositionTicks?: number;
  Command: SendCommandType;
  EmittedAt: string;
}

export type GroupUpdateType =
  | 'UserJoined'
  | 'UserLeft'
  | 'GroupJoined'
  | 'GroupLeft'
  | 'StateUpdate'
  | 'PlayQueue'
  | 'NotInGroup'
  | 'GroupDoesNotExist'
  | 'CreateGroupDenied'
  | 'JoinGroupDenied'
  | 'LibraryAccessDenied';

export interface GroupUpdate {
  GroupId: string;
  Type: GroupUpdateType;
  Data: any;
}
