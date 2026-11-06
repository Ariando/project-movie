// All OMDb access goes through our own backend, so no API key is ever
// present in client-side code. See server.js.
const API_BASE = '/api/movies';

function searchMovies () {
    $('#movie-list').html('');
    $.ajax({
        url: API_BASE,
        type: 'get',
        dataType: 'json',
        data: {
            'q' : $('#search-input').val()
        },
        success: (result) => {
            let movies = result.results;

            $.each(movies, function (i, data) {
                $('#movie-list').append(`
                <div class="col-md-4 mb-4">
                    <div class="card">
                        <img src="${data.poster}" class="card-img-top img-fluid" alt="...">
                        <div class="card-body">
                            <h5 class="card-title">${data.title}</h5>
                            <h6 class"card-subtitle mb-2 text-muted>${data.year}</h6>
                            <a href="#" class="card-link see-detail" data-toggle="modal" data-target="#exampleModal" data-id="${data.imdbID}">See Details...</a>
                        </div>
                    </div>
                </div>
                `);
            });

            $('#search-input').val('');
        },
        error: (xhr) => {
            const message = (xhr.responseJSON && xhr.responseJSON.error) || 'Something went wrong.';
            $('#movie-list').html(`
            <h1>${message}</h1>`
            )
        }
    });
};

$('#search-button').on('click', function () {
    searchMovies();
});

$('#search-input').on('keyup', function (e) { 
    if (e.keyCode === 13) {
        searchMovies();
    }
});

$('#movie-list').on('click','.see-detail', function () {

    $.ajax({
        url : `${API_BASE}/${$(this).data('id')}`,
        dataType : 'json',
        type : 'get',
        success : function (movie) {

            $('.modal-title').html(`
                ${movie.title} 
            `);

            $('.modal-body').html(`
                <div class="container-fluid">
                    <div class="row">
                        <div class"col-md-4">
                            <img src="${movie.poster}" class="img-fluid"> 
                        </div>
                        <div class="col-md-8">
                            <ul class="list-group">
                                <li class="list-group-item"><h3>${movie.title}</h3></li>
                                <li class="list-group-item">Year: ${movie.year}</li>
                                <li class="list-group-item">Released: ${movie.released}</li>
                                <li class="list-group-item">Runtime: ${movie.runtime}</li>
                                <li class="list-group-item">Genre: ${movie.genre}</li>
                            </ul>
                        </div>
                    </div>
                </div>
            `);
        },
        error : function (xhr) {
            const message = (xhr.responseJSON && xhr.responseJSON.error) || 'Could not load movie details.';
            $('.modal-body').html(`<p>${message}</p>`);
        }
    });

});
