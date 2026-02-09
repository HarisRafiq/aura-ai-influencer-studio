from typing import List
from ddgs import DDGS
import requests
from bs4 import BeautifulSoup
import traceback
import asyncio
from functools import partial

def web_search(queries: List[str]) -> str:
    """
    Performs web searches using DuckDuckGo for a list of queries.
    
    Args:
        queries: A list of search queries.
        
    Returns:
        A string containing the search results for each query.
    """
    import json
    results_data = []
    
    try:
        with DDGS() as ddgs:
            for query in queries:
                print(f"[Web Tools] Searching for: {query}")
                # Try with max_results=5 for better coverage
                results = list(ddgs.text(query, max_results=5))
                
                query_results = []
                if results:
                    for res in results:
                        query_results.append({
                            "title": res.get('title', ''),
                            "snippet": res.get('body', ''),
                            "url": res.get('href', '')
                        })
                
                results_data.append({
                    "query": query,
                    "results": query_results
                })
                
    except Exception as e:
        error_msg = f"Error performing web search: {str(e)}"
        print(f"[Web Tools] {error_msg}")
        traceback.print_exc()
        return json.dumps({"error": error_msg})

    return json.dumps(results_data, indent=2)

def web_page_reader(urls: List[str]) -> str:
    """
    Reads the content of web pages from a list of URLs.
    
    Args:
        urls: A list of URLs to read.
        
    Returns:
        A string containing the content of each page.
    """
    contents = []
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    for url in urls:
        print(f"[Web Tools] Reading page: {url}")
        try:
            # Simple validation to ensure it's a URL
            if not url.startswith('http'):
                url = 'https://' + url
                
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Remove script and style elements
            for script in soup(["script", "style"]):
                script.decompose()
                
            # Get text
            text = soup.get_text()
            
            # Break into lines and remove leading/trailing space on each
            lines = (line.strip() for line in text.splitlines())
            # Break multi-headlines into a line each
            chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
            # Drop blank lines
            text = '\n'.join(chunk for chunk in chunks if chunk)
            
            # Truncate if too long (to avoid context limit issues)
            if len(text) > 10000:
                text = text[:10000] + "... [Truncated]"
                
            contents.append(f"Content from {url}:\n{text}\n")
            
        except Exception as e:
            error_msg = f"Error reading {url}: {str(e)}"
            print(f"[Web Tools] {error_msg}")
            contents.append(error_msg)
            
    return "\n".join(contents)


async def async_web_search(queries: List[str]) -> str:
    """
    Async wrapper for web_search that performs web searches using DuckDuckGo.
    
    Args:
        queries: A list of search queries.
        
    Returns:
        A JSON string containing the search results for each query.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, web_search, queries)


async def async_web_page_reader(urls: List[str]) -> str:
    """
    Async wrapper for web_page_reader that reads content from web pages.
    
    Args:
        urls: A list of URLs to read.
        
    Returns:
        A string containing the content of each page.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, web_page_reader, urls)


def image_search(query: str, max_results: int = 5) -> str:
    """
    Performs image search using DuckDuckGo.
    
    Args:
        query: Search query for images.
        max_results: Maximum number of images to return.
        
    Returns:
        JSON string containing image results with URLs, titles, and sources.
    """
    import json
    
    try:
        with DDGS() as ddgs:
            print(f"[Web Tools] Image search for: {query}")
            results = list(ddgs.images(query, max_results=max_results))
            
            image_results = []
            for res in results:
                image_results.append({
                    "title": res.get('title', ''),
                    "image_url": res.get('image', ''),
                    "thumbnail_url": res.get('thumbnail', ''),
                    "source_url": res.get('url', ''),
                    "source": res.get('source', ''),
                    "width": res.get('width', 0),
                    "height": res.get('height', 0)
                })
            
            print(f"[Web Tools] Found {len(image_results)} images")
            return json.dumps({
                "query": query,
                "images": image_results
            }, indent=2)
            
    except Exception as e:
        error_msg = f"Error performing image search: {str(e)}"
        print(f"[Web Tools] {error_msg}")
        traceback.print_exc()
        return json.dumps({"error": error_msg})


async def async_image_search(query: str, max_results: int = 5) -> str:
    """
    Async wrapper for image_search.
    
    Args:
        query: Search query for images.
        max_results: Maximum number of images to return.
        
    Returns:
        JSON string containing image results.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, image_search, query, max_results)

