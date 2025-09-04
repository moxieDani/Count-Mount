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
		
		const response = await sheets.spreadsheets.values.get({
			auth,
			spreadsheetId,
			range: 'Sheet1!A1:Z1000', // 충분한 범위로 설정
		});
		
		return json({
			values: response.data.values || [],
			spreadsheetId
		});
	} catch (error) {
		console.error('Sheets API Error:', error);
		return json(
			{ error: 'Failed to fetch spreadsheet data' },
			{ status: 500 }
		);
	}
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const { spreadsheetId } = params;
	const authHeader = request.headers.get('authorization');
	
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return json({ error: 'Authorization header required' }, { status: 401 });
	}
	
	const accessToken = authHeader.substring(7);
	
	try {
		const { range, values } = await request.json();
		
		const auth = new google.auth.OAuth2();
		auth.setCredentials({ access_token: accessToken });
		
		const response = await sheets.spreadsheets.values.update({
			auth,
			spreadsheetId,
			range,
			valueInputOption: 'USER_ENTERED',
			requestBody: {
				values
			}
		});
		
		return json({
			updatedCells: response.data.updatedCells,
			updatedRange: response.data.updatedRange
		});
	} catch (error) {
		console.error('Sheets API Update Error:', error);
		return json(
			{ error: 'Failed to update spreadsheet' },
			{ status: 500 }
		);
	}
};