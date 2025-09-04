import { json } from '@sveltejs/kit';
import { google } from 'googleapis';
import type { RequestHandler } from './$types';

const sheets = google.sheets('v4');

export const GET: RequestHandler = async ({ params, request }) => {
	const { spreadsheetId } = params;
	const authHeader = request.headers.get('authorization');
	
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return json({ error: 'Authorization header required' }, { status: 401 });
	}
	
	const accessToken = authHeader.substring(7);
	
	try {
		const auth = new google.auth.OAuth2();
		auth.setCredentials({ access_token: accessToken });
		
		// 스프레드시트 메타데이터 가져오기 (시트 목록 포함)
		const response = await sheets.spreadsheets.get({
			auth,
			spreadsheetId,
			fields: 'properties,sheets.properties'
		});
		
		const spreadsheet = response.data;
		const sheetsList = spreadsheet.sheets?.map(sheet => {
			const props = sheet.properties;
			return {
				sheetId: props?.sheetId,
				title: props?.title,
				index: props?.index,
				sheetType: props?.sheetType,
				gridProperties: {
					rowCount: props?.gridProperties?.rowCount,
					columnCount: props?.gridProperties?.columnCount
				}
			};
		}) || [];
		
		return json({
			spreadsheetTitle: spreadsheet.properties?.title,
			spreadsheetId,
			sheets: sheetsList
		});
		
	} catch (error) {
		console.error('Sheets API Info Error:', error);
		return json(
			{ error: 'Failed to fetch spreadsheet information' },
			{ status: 500 }
		);
	}
};