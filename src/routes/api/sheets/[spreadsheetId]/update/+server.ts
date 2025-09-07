import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
    const { spreadsheetId } = params;
    
    // Authorization 헤더에서 액세스 토큰 추출
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) {
        return json({ error: 'Missing or invalid authorization header' }, { status: 401 });
    }
    
    const accessToken = authorization.replace('Bearer ', '');
    
    if (!spreadsheetId) {
        return json({ 
            error: 'Missing required parameter: spreadsheetId' 
        }, { status: 400 });
    }
    
    try {
        const body = await request.json();
        const { range, values, valueInputOption } = body;
        
        if (!range || !values) {
            return json({ 
                error: 'Missing required parameters: range and values' 
            }, { status: 400 });
        }
        
        console.log('Update API Request Details:', {
            spreadsheetId,
            range,
            values,
            valueInputOption
        });
        
        // Google Sheets API로 데이터 업데이트
        const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=${valueInputOption || 'RAW'}`;
        console.log('Update API URL:', updateUrl);
        
        const updateResponse = await fetch(updateUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                values: values
            })
        });
        
        if (!updateResponse.ok) {
            const errorText = await updateResponse.text();
            console.error('Google Sheets API update error:', {
                status: updateResponse.status,
                statusText: updateResponse.statusText,
                error: errorText
            });
            
            return json({ 
                error: `Failed to update data in Google Sheets: ${updateResponse.statusText}`,
                details: errorText
            }, { status: updateResponse.status });
        }
        
        const updateData = await updateResponse.json();
        console.log('Update API Response received:', { 
            updatedCells: updateData.updatedCells,
            updatedColumns: updateData.updatedColumns,
            updatedRows: updateData.updatedRows
        });
        
        return json({
            success: true,
            updatedRange: updateData.updatedRange,
            updatedCells: updateData.updatedCells,
            updatedColumns: updateData.updatedColumns,
            updatedRows: updateData.updatedRows,
            metadata: {
                spreadsheetId,
                requestedRange: range,
                actualRange: updateData.updatedRange
            }
        });
        
    } catch (error) {
        console.error('Error updating sheet data:', error);
        return json({ 
            error: 'Internal server error while updating sheet data',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
};