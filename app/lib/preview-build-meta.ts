import { isPreview } from './gist.ts'
import { format, t } from './i18n.ts'

export type PreviewBuildChrome = {
	line: string
	title?: string
}

/**
 * Optional branch / build timestamp (and short commit) baked into preview images via Docker
 * build args. Omitted in production and in local preview runs without those args.
 */
export function getPreviewBuildChrome(): PreviewBuildChrome | null {
	if (!isPreview()) return null
	const branch = process.env.PREVIEW_GIT_BRANCH?.trim()
	const builtAt = process.env.PREVIEW_BUILD_ISO?.trim()
	const commitShort = process.env.PREVIEW_GIT_SHA_SHORT?.trim()
	const lineParts = [branch, builtAt].filter(
		(part): part is string => typeof part === 'string' && part.length > 0,
	)
	let line: string
	if (lineParts.length > 0) {
		line = lineParts.join(' · ')
	} else if (commitShort) {
		line = commitShort
	} else {
		return null
	}
	const title = commitShort
		? format(t('app.previewDeployTitle'), { commit: commitShort })
		: undefined
	return { line, title }
}
