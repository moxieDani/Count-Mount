import { json } from '@sveltejs/kit';
import { google } from 'googleapis';
import type { RequestHandler } from './$types';
import { sortRange } from '$lib/ledger/rows';

const sheets = google.sheets('v4');

// Helper function to convert a column letter (A, B, C) to a zero-based index
function colA1ToIndex(colA1: string): number {
    let index = 0;
    for (let i = 0; i < colA1.length; i++) {
        index = index * 26 + colA1.charCodeAt(i) - 'A'.charCodeAt(0) + 1;
    }
    return index - 1;
}

export const POST: RequestHandler = async ({ params, request }) => {
    const { spreadsheetId } = params;
    
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) {
        return json({ error: 'Missing or invalid authorization header' }, { status: 401 });
    }
    
    const accessToken = authorization.replace('Bearer ', '');
    
    if (!spreadsheetId) {
        return json({ error: 'Missing required parameter: spreadsheetId' }, { status: 400 });
    }
    
    try {
        const body = await request.json();
        const { range, values, valueInputOption, sheetName, dataRange } = body;
        
        if (!range || !values) {
            return json({ error: 'Missing required parameters: range and values' }, { status: 400 });
        }

        const auth = new google.auth.OAuth2();
		auth.setCredentials({ access_token: accessToken });
        
        // 1. Update the cell values
        const updateResponse = await sheets.spreadsheets.values.update({
            auth,
            spreadsheetId,
            range,
            valueInputOption: valueInputOption || 'RAW',
            requestBody: {
                values
            }
        });

        // 2. After successful update, sort the sheet
        if (updateResponse.status === 200 && sheetName && dataRange) {
            try {
                // Find the sheetId for the given sheetName
                const sheetMeta = await sheets.spreadsheets.get({ auth, spreadsheetId, fields: 'sheets.properties.title,sheets.properties.sheetId' });
                const sheet = sheetMeta.data.sheets?.find(s => s.properties?.title === sheetName);

                if (typeof sheet?.properties?.sheetId === 'number') {
                    const sheetId = sheet.properties.sheetId;
                    // dataRange는 "정렬하라"는 표시로만 본다: 범위는 늘 Y27:AE126 (옛 화면이 Y~AD를 보내도 AE가 줄과 함께)
                    const sortColumnIndex = colA1ToIndex('Y'); // Sort by column Y

                    await sheets.spreadsheets.batchUpdate({
                        auth,
                        spreadsheetId,
                        requestBody: {
                            requests: [{
                                sortRange: {
                                    range: sortRange(sheetId),
                                    sortSpecs: [{
                                        dimensionIndex: sortColumnIndex,
                                        sortOrder: 'ASCENDING'
                                    }]
                                }
                            }]
                        }
                    });
                }
            } catch (sortError) {
                console.error('Failed to sort sheet after update:', sortError);
                // Do not block the success of the update, just log the sort error
            }
        }
        
        return json({
            success: true,
            updatedRange: updateResponse.data.updatedRange,
            updatedCells: updateResponse.data.updatedCells
        });
        
    } catch (error) {
        console.error('Error updating sheet data:', error);
        return json({ 
            error: 'Internal server error while updating sheet data',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
};