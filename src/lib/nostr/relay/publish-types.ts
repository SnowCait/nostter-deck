export type PublishStage = 'uploading-media' | 'signing' | 'publishing';
export type PublishFailureReason =
	| 'media-upload-failed'
	| 'signing-timeout'
	| 'signing-failed'
	| 'account-mismatch'
	| 'relay-timeout'
	| 'relay-rejected'
	| 'relay-failed';
