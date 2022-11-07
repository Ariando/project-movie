function searchMovies () {
    $('#movie-list').html('');
    $.ajax({
        url: 'http://omdbapi.com',
        type: 'get',
        dataType: 'json',
        data: {
            'apikey' : '3856d278',
            's' : $('#search-input').val()
        },
        success: (result) => {
            if (result.Response == "True") {
                let movies = result.Search;

                $.each(movies, function (i, data) {
                    $('#movie-list').append(`
                    <div class="col-md-4 mb-4">
                        <div class="card">
                            <img src="${data.Poster}" class="card-img-top img-fluid" alt="...">
                            <div class="card-body">
                                <h5 class="card-title">${data.Title}</h5>
                                <h6 class"card-subtitle mb-2 text-muted>${data.Year}</h6>
                                <a href="#" class="card-link see-detail" data-toggle="modal" data-target="#exampleModal" data-id="${data.imdbID}">See Details...</a>
                            </div>
                        </div>
                    </div>
                    `);
                });

                $('#search-input').val('');

            } else {
                $('#movie-list').html(`
                <h1>${result.Error}</h1>`
                )
            }
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
        url : 'http://omdbapi.com',
        dataType : 'json',
        type : 'get',
        data : {
            'apikey' : '3856d278',
            'i' : $(this).data('id')
        },
        success : function (movie) {
            if (movie.Response === "True" ) {

                $('.modal-title').html(`
                    ${movie.Title} 
                `);

                $('.modal-body').html(`
                    <div class="container-fluid">
                        <div class="row">
                            <div class"col-md-4">
                                <img src="${movie.Poster}" class="img-fluid"> 
                            </div>
                            <div class="col-md-8">
                                <ul class="list-group">
                                    <li class="list-group-item"><h3>${movie.Title}</h3></li>
                                    <li class="list-group-item">Year: ${movie.Year}</li>
                                    <li class="list-group-item">Released: ${movie.Released}</li>
                                    <li class="list-group-item">Runtime: ${movie.Runtime}</li>
                                    <li class="list-group-item">Genre: ${movie.Genre}</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                `);
                
            } else {
                
            }
        }


    });

});

